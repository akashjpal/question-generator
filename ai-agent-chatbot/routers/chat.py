import logging

from fastapi import APIRouter, HTTPException

from auth.supabase_auth import CurrentUser, AuthedUser
from agent import runner
from models.schemas import (
    ChatMessageOut,
    ChatRequest,
    CreateSessionResponse,
    SessionDetail,
    SessionSummary,
)
from persistence import chat_store

logger = logging.getLogger(__name__)
router = APIRouter()


def _to_summary(row: dict) -> SessionSummary:
    return SessionSummary(
        id=row["id"],
        title=row.get("title"),
        status=row["status"],
        last_assessment_id=row.get("last_assessment_id"),
        processing=bool(row.get("processing", False)),
        current_tool=row.get("current_tool"),
        current_step=row.get("current_step"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _to_message_out(m: dict) -> ChatMessageOut:
    return ChatMessageOut(
        id=m["id"],
        role=m["role"],
        content=m["content"],
        tool_name=m.get("tool_name"),
        tool_payload=m.get("tool_payload"),
        sequence=m["sequence"],
        created_at=m["created_at"],
    )


@router.post("/sessions", response_model=CreateSessionResponse)
async def create_session(user: AuthedUser = CurrentUser):
    session = await chat_store.create_session(user.id)
    return CreateSessionResponse(id=session["id"])


@router.get("/sessions", response_model=list[SessionSummary])
async def list_sessions(user: AuthedUser = CurrentUser):
    rows = await chat_store.list_sessions(user.id)
    return [_to_summary(r) for r in rows]


@router.get("/sessions/{session_id}", response_model=SessionDetail)
async def get_session(session_id: str, user: AuthedUser = CurrentUser):
    session = await chat_store.get_session(session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    messages = await chat_store.list_messages(session_id)
    return SessionDetail(
        session=_to_summary(session),
        messages=[_to_message_out(m) for m in messages],
    )


@router.post("/sessions/{session_id}/chat", response_model=ChatMessageOut, status_code=202)
async def chat(session_id: str, body: ChatRequest, user: AuthedUser = CurrentUser):
    """Fires the agent turn in the background and returns immediately. The
    frontend polls GET /sessions/{id} — session.processing/current_tool/
    current_step show live progress, and new rows appear in .messages once
    the turn finishes (processing goes back to false). See agent/runner.py.
    """
    session = await chat_store.get_session(session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("processing"):
        raise HTTPException(status_code=409, detail="Agent is still processing the previous message.")

    user_message = await chat_store.append_message(session_id, "user", body.message)
    # Synchronous, before returning: closes the race where the frontend's
    # first poll could see processing=false before the background task starts.
    await chat_store.start_processing(session_id)
    runner.start_turn(session_id, user.id, user.token)

    return _to_message_out(user_message)
