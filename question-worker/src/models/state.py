import operator
from typing import Annotated, TypedDict

from src.models.job import JobPayload
from src.models.outputs import GeneratedQuestion, RejectedQuestion


class PipelineState(TypedDict, total=False):
    """LangGraph state for the whole validate->...->persist pipeline. `accepted`
    and `rejected` use an additive reducer because the generate<->judge loop
    revisits those nodes multiple times per job and each round only returns
    its own delta — LangGraph concatenates across rounds. Every other key is
    plain last-write-wins (set once, or intentionally overwritten each round
    like `needed`/`regeneration_round`)."""

    job: JobPayload
    warnings: list[str]

    pdf_bytes: bytes | None
    raw_text: str | None
    num_questions: int  # effective count, may be clamped down from job.num_questions

    chunks: list[str]
    chunk_embeddings: list[list[float]]
    topic_embedding: list[float] | None

    selected_chunks: list[str]
    selected_chunk_ids: list[int]

    candidates: list[GeneratedQuestion]

    accepted: Annotated[list[GeneratedQuestion], operator.add]
    rejected: Annotated[list[RejectedQuestion], operator.add]

    regeneration_round: int
    needed: int

    error: str | None
    skip_reason: str | None
