from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class JobPayload(BaseModel):
    """SQS message body published by question-generator-api-ts's
    POST /generate-questions (index.ts) — field names/casing are that
    publisher's contract and must not change here. requested_at isn't part of
    the published payload; it's stamped from the SQS message's own
    SentTimestamp attribute by the dispatcher, or falls back to now()."""

    model_config = ConfigDict(populate_by_name=True)

    job_id: str = Field(alias="jobId")
    file_id: str = Field(alias="fileId")
    file_name: str | None = Field(default=None, alias="fileName")
    num_questions: int = Field(default=10, ge=1, le=50, alias="noOfQuestion")
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    topic: str | None = None
    requested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("job_id", mode="before")
    @classmethod
    def _coerce_job_id_to_str(cls, value):
        # ai-generated-question-status.id is a Postgres-generated numeric PK;
        # the publisher sends it unstringified (a JSON number). Pydantic v2
        # doesn't coerce int -> str by default (unlike v1), so without this
        # every real job fails validation and is treated as a poison message.
        return str(value) if isinstance(value, (int, float)) else value

    @field_validator("difficulty", mode="before")
    @classmethod
    def _normalize_difficulty(cls, value):
        # The frontend sends whatever a <select> gives it — normalize casing
        # instead of hard-failing the whole job on "Medium" vs "medium".
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator("topic", mode="before")
    @classmethod
    def _blank_topic_to_none(cls, value):
        return None if isinstance(value, str) and not value.strip() else value
