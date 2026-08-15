import json
import re

from pydantic import ValidationError

from src.graph.errors import TransientJobError
from src.graph.nodes.generate import DIFFICULTY_DEFINITIONS
from src.models.outputs import GeneratedQuestion, JudgeVerdict, RejectedQuestion
from src.models.state import PipelineState
from src.services import status
from src.services.container import Services
from src.utils.logging import get_logger

logger = get_logger()

_PROMPT_TEMPLATE = """You are judging candidate multiple-choice questions for quality control.

TOPIC: {topic}
DIFFICULTY: {difficulty} — {difficulty_definition}

CANDIDATES (index. question — cites chunk ids):
{candidates_block}

SOURCE CHUNKS (referenced by id):
{chunks_block}

For each candidate, judge:
- difficulty_match: does it actually match the stated difficulty?
- topic_relevant: is it relevant to the topic (true by default if no topic was given)?
- grounded_in_source: is it answerable strictly from the cited source chunks, with no invented facts?
- accept: true only if all three checks pass.

Respond with ONLY a JSON object, no prose, no markdown fences:
{{
  "verdicts": [
    {{"question_index": 0, "difficulty_match": true, "topic_relevant": true, "grounded_in_source": true, "accept": true, "reason": "..."}}
  ]
}}
`reason` is required for every verdict, including accepted ones — briefly say why it passed or failed.
"""


def _build_prompt(state: PipelineState, candidates: list[GeneratedQuestion]) -> str:
    job = state["job"]
    chunks_block = "\n".join(
        f"[{cid}] {text}" for cid, text in zip(state["selected_chunk_ids"], state["selected_chunks"])
    )
    candidates_block = "\n".join(
        f"{i}. {c.question_text} (cites chunks {c.source_chunk_ids})" for i, c in enumerate(candidates)
    )
    return _PROMPT_TEMPLATE.format(
        topic=job.topic or "(none specified — judge topic_relevant=true by default)",
        difficulty=job.difficulty,
        difficulty_definition=DIFFICULTY_DEFINITIONS[job.difficulty],
        candidates_block=candidates_block,
        chunks_block=chunks_block,
    )


def _parse_verdicts(raw: str) -> list[JudgeVerdict]:
    clean = re.sub(r"```(?:json)?\s*", "", raw).strip().strip("`").strip()
    start = clean.find("{")
    end = clean.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object found in judge response")
    data = json.loads(clean[start:end])

    verdicts: list[JudgeVerdict] = []
    for item in data.get("verdicts", []):
        try:
            verdicts.append(JudgeVerdict.model_validate(item))
        except ValidationError as exc:
            logger.warning("dropping malformed judge verdict", error=str(exc))
    return verdicts


def make_judge_node(services: Services):
    async def judge(state: PipelineState) -> dict:
        job = state["job"]
        await status.update_stage(services.db, job.job_id, "judge")

        candidates = state["candidates"]
        round_num = state.get("regeneration_round", 0) + 1

        accepted_delta: list[GeneratedQuestion] = []
        rejected_delta: list[RejectedQuestion] = []

        if candidates:
            prompt = _build_prompt(state, candidates)
            try:
                response = await services.judge_llm.ainvoke(prompt)
                verdicts = _parse_verdicts(response.content)
            except Exception as exc:
                raise TransientJobError(f"judge node failed: {exc}") from exc

            by_index = {v.question_index: v for v in verdicts}
            for i, candidate in enumerate(candidates):
                verdict = by_index.get(i)
                if verdict is None:
                    # Model dropped this index — treat conservatively as
                    # rejected rather than silently discarding it.
                    rejected_delta.append(
                        RejectedQuestion(
                            text=candidate.question_text,
                            reason="no verdict returned by judge",
                            source="judge",
                            round=round_num,
                        )
                    )
                    continue
                if verdict.accept:
                    accepted_delta.append(candidate)
                else:
                    rejected_delta.append(
                        RejectedQuestion(
                            text=candidate.question_text,
                            reason=verdict.reason,
                            source="judge",
                            round=round_num,
                        )
                    )

        total_accepted = len(state.get("accepted") or []) + len(accepted_delta)
        needed = max(0, state["num_questions"] - total_accepted)

        return {
            "accepted": accepted_delta,
            "rejected": rejected_delta,
            "needed": needed,
            "regeneration_round": round_num,
        }

    return judge
