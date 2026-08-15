import numpy as np

from src.models.outputs import GeneratedQuestion, RejectedQuestion
from src.models.state import PipelineState
from src.services import status
from src.services.container import Services


def _cosine(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a), np.array(b)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    return float(va @ vb / denom) if denom else 0.0


def make_dedupe_node(services: Services):
    async def dedupe(state: PipelineState) -> dict:
        job = state["job"]
        await status.update_stage(services.db, job.job_id, "dedupe")

        candidates: list[GeneratedQuestion] = state["candidates"]
        if not candidates:
            return {"candidates": []}

        accepted = state.get("accepted") or []
        round_num = state.get("regeneration_round", 0) + 1
        threshold = services.settings.duplicate_similarity_threshold

        candidate_vectors = await services.embeddings.embed([c.question_text for c in candidates])
        accepted_vectors = (
            await services.embeddings.embed([a.question_text for a in accepted]) if accepted else []
        )

        # Reference pool grows as we keep candidates within this same batch,
        # so within-batch near-duplicates are caught too, not just against
        # already-accepted questions from earlier rounds.
        ref_vectors: list[list[float]] = list(accepted_vectors)
        ref_texts: list[str] = [a.question_text for a in accepted]

        kept: list[GeneratedQuestion] = []
        rejected: list[RejectedQuestion] = []

        for candidate, vector in zip(candidates, candidate_vectors):
            dup_of = next(
                (text for text, ref_vec in zip(ref_texts, ref_vectors) if _cosine(vector, ref_vec) >= threshold),
                None,
            )
            if dup_of is not None:
                rejected.append(
                    RejectedQuestion(
                        text=candidate.question_text,
                        reason=f"near-duplicate of: {dup_of}",
                        source="dedupe",
                        round=round_num,
                    )
                )
                continue
            kept.append(candidate)
            ref_vectors.append(vector)
            ref_texts.append(candidate.question_text)

        return {"candidates": kept, "rejected": rejected}

    return dedupe
