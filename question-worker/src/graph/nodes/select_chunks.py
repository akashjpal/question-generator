import numpy as np

from src.models.state import PipelineState
from src.services import status
from src.services.container import Services


def _rank_by_similarity(topic_vector: list[float], chunk_vectors: list[list[float]]) -> list[int]:
    topic = np.array(topic_vector)
    matrix = np.array(chunk_vectors)
    norms = np.linalg.norm(matrix, axis=1) * np.linalg.norm(topic)
    norms[norms == 0] = 1e-10
    similarities = (matrix @ topic) / norms
    return list(np.argsort(-similarities))


def _spread_indices(total: int, k: int) -> list[int]:
    """Evenly strided indices across the document so questions cover the
    whole PDF, not just page 1, when there's no topic to rank chunks by."""
    if k >= total:
        return list(range(total))
    if k <= 1:
        return [0]
    return sorted({round(i * (total - 1) / (k - 1)) for i in range(k)})


def make_select_chunks_node(services: Services):
    async def select_chunks(state: PipelineState) -> dict:
        job = state["job"]
        await status.update_stage(services.db, job.job_id, "select_chunks")

        chunks = state["chunks"]
        num_questions = state["num_questions"]
        # ~2 chunks per question when available, but never more than we have.
        k = min(len(chunks), max(num_questions, num_questions * 2))

        if job.topic and state.get("topic_embedding") is not None:
            ranked = _rank_by_similarity(state["topic_embedding"], state["chunk_embeddings"])
            selected_ids = sorted(int(i) for i in ranked[:k])
        else:
            selected_ids = _spread_indices(len(chunks), k)

        selected_chunks = [chunks[i] for i in selected_ids]
        return {"selected_chunks": selected_chunks, "selected_chunk_ids": selected_ids}

    return select_chunks
