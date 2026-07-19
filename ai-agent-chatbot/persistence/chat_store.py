"""
Supabase CRUD for chat sessions/messages — the single persistence path (no
LangGraph checkpointer). Agent state is rebuilt from these tables on every
turn (see agent/state.py's build_state_from_rows); the processing/
current_tool/current_step columns are what the frontend polls to see live
progress (GET /sessions/{id}) while a turn runs in the background
(agent/runner.py).
"""
import logging
from datetime import datetime, timezone
from typing import Any

from auth.supabase_auth import get_supabase_admin

logger = logging.getLogger(__name__)

SESSIONS_TABLE = "agent_chat_sessions"
MESSAGES_TABLE = "agent_chat_messages"


async def create_session(user_id: str, title: str | None = None) -> dict[str, Any]:
    client = get_supabase_admin()
    now = datetime.now(timezone.utc).isoformat()
    res = (
        client.table(SESSIONS_TABLE)
        .insert({"user_id": user_id, "title": title, "status": "active", "created_at": now, "updated_at": now})
        .execute()
    )
    return res.data[0]


async def list_sessions(user_id: str) -> list[dict[str, Any]]:
    client = get_supabase_admin()
    res = (
        client.table(SESSIONS_TABLE)
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return res.data or []


async def get_session(session_id: str, user_id: str) -> dict[str, Any] | None:
    client = get_supabase_admin()
    res = (
        client.table(SESSIONS_TABLE)
        .select("*")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


async def get_most_recent_active_session(user_id: str) -> dict[str, Any] | None:
    client = get_supabase_admin()
    res = (
        client.table(SESSIONS_TABLE)
        .select("*")
        .eq("user_id", user_id)
        .eq("status", "active")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


async def touch_session(session_id: str, **fields: Any) -> None:
    client = get_supabase_admin()
    payload = {**fields, "updated_at": datetime.now(timezone.utc).isoformat()}
    client.table(SESSIONS_TABLE).update(payload).eq("id", session_id).execute()


async def set_pending_file(session_id: str, file_id: str, file_name: str) -> None:
    await touch_session(session_id, pending_file_id=file_id, pending_file_name=file_name)


async def mark_published(session_id: str, assessment_id: int) -> None:
    await touch_session(session_id, last_assessment_id=assessment_id, status="completed")


async def start_processing(session_id: str) -> None:
    await touch_session(session_id, processing=True, current_tool=None, current_step="Thinking…")


async def set_progress(session_id: str, tool: str | None, step: str | None) -> None:
    await touch_session(session_id, current_tool=tool, current_step=step)


async def finish_processing(session_id: str) -> None:
    await touch_session(session_id, processing=False, current_tool=None, current_step=None)


async def list_messages(session_id: str) -> list[dict[str, Any]]:
    client = get_supabase_admin()
    res = (
        client.table(MESSAGES_TABLE)
        .select("*")
        .eq("session_id", session_id)
        .order("sequence", desc=False)
        .execute()
    )
    return res.data or []


async def append_message(
    session_id: str,
    role: str,
    content: str,
    tool_name: str | None = None,
    tool_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    client = get_supabase_admin()
    existing = await list_messages(session_id)
    sequence = len(existing)
    now = datetime.now(timezone.utc).isoformat()
    res = (
        client.table(MESSAGES_TABLE)
        .insert({
            "session_id": session_id,
            "role": role,
            "content": content,
            "tool_name": tool_name,
            "tool_payload": tool_payload,
            "sequence": sequence,
            "created_at": now,
        })
        .execute()
    )
    await touch_session(session_id)
    return res.data[0]
