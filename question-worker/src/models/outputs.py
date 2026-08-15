from typing import Literal

from pydantic import BaseModel, Field, field_validator


class GeneratedQuestion(BaseModel):
    """One MCQ candidate. Field names map directly onto the existing
    ai-generated-questions table (question_text/options/correct_option/
    explanation) — see save_questions_to_db in the legacy worker."""

    question_text: str
    options: list[str] = Field(min_length=4, max_length=4)
    correct_option: Literal["A", "B", "C", "D"]
    explanation: str
    source_chunk_ids: list[int] = Field(default_factory=list)

    @field_validator("correct_option", mode="before")
    @classmethod
    def _normalize_correct_option(cls, value):
        return str(value).strip().upper() if value is not None else value

    @field_validator("question_text", "explanation", mode="before")
    @classmethod
    def _strip_str(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("options", mode="before")
    @classmethod
    def _strip_options(cls, value):
        return [str(o).strip() for o in value] if isinstance(value, list) else value


class RejectedQuestion(BaseModel):
    text: str
    reason: str
    source: Literal["judge", "dedupe"]
    round: int


class JudgeVerdict(BaseModel):
    """One verdict per candidate question in a judge call. `reason` is
    required even on accept — it's what gets logged/surfaced, and forcing the
    model to always produce one makes rejects auditable without a second
    schema branch."""

    question_index: int
    difficulty_match: bool
    topic_relevant: bool
    grounded_in_source: bool
    accept: bool
    reason: str
