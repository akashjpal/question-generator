from typing import Any, Literal

from pydantic import BaseModel


class CreateSessionResponse(BaseModel):
    id: str


class SessionSummary(BaseModel):
    id: str
    title: str | None = None
    status: str
    last_assessment_id: int | None = None
    processing: bool = False
    current_tool: str | None = None
    current_step: str | None = None
    created_at: str
    updated_at: str


class ChatMessageOut(BaseModel):
    id: str
    role: Literal["user", "assistant", "tool"]
    content: str
    tool_name: str | None = None
    tool_payload: dict[str, Any] | None = None
    sequence: int
    created_at: str


class SessionDetail(BaseModel):
    session: SessionSummary
    messages: list[ChatMessageOut]


class ChatRequest(BaseModel):
    message: str


class UploadResponse(BaseModel):
    fileId: str
    fileName: str


class PublishedQuizSummary(BaseModel):
    assessment_id: int
    title: str
    code: str
    attempt_link: str
    time_limit: int | None = None
    questions_count: int
