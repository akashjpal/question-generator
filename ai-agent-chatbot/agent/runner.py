"""
Turn orchestration — replaces the old SSE streaming layer.

POST /sessions/{id}/chat fires a turn via start_turn() and returns
immediately (202); the frontend polls GET /sessions/{id} to see live
progress (chat_store.processing/current_tool/current_step, updated by
agent/nodes.py as the graph runs) and picks up new messages once
processing goes back to false.

No new infra — this is a single-instance service (see Dockerfile: plain
`uvicorn main:app`, no --workers), so an in-process asyncio.create_task is
enough. Known accepted limitation: if the process crashes mid-turn,
`processing` stays true and the frontend polls indefinitely — acceptable
for this dev-stage service (see the plan's Known accepted limitation note).
"""
import asyncio
import logging

from agent.graph import get_graph
from agent.request_context import set_current_token
from agent.state import build_state_from_rows
from persistence import chat_store

logger = logging.getLogger(__name__)

# Keeps a reference to in-flight tasks so they aren't garbage-collected mid-run
# (asyncio.create_task only holds a weak reference otherwise).
_running: dict[str, asyncio.Task] = {}


def start_turn(session_id: str, user_id: str, bearer_token: str) -> asyncio.Task:
    set_current_token(bearer_token)  # copied into the new task's context below
    task = asyncio.create_task(_run_turn(session_id, user_id))
    _running[session_id] = task
    task.add_done_callback(lambda t: _running.pop(session_id, None))
    return task


async def _run_turn(session_id: str, user_id: str) -> None:
    try:
        session = await chat_store.get_session(session_id, user_id)
        if not session:
            logger.error("Turn started for missing session %s", session_id)
            return
        rows = await chat_store.list_messages(session_id)  # already includes the new user row
        state = build_state_from_rows(session, user_id, rows)
        result = await get_graph().ainvoke(state)

        for entry in result.get("chat_log", []):
            await chat_store.append_message(
                session_id, entry["role"], entry["content"],
                tool_name=entry.get("tool_name"), tool_payload=entry.get("tool_payload"),
            )
        published = result.get("published")
        if published:
            # A separate, purpose-built assistant-role row carrying the
            # structured payload the frontend needs to render the published-
            # quiz card (the tool's own chat_log entry is role="tool" —
            # internal bookkeeping, filtered out of the chat UI; the
            # planner's own final reply is plain text with no tool_payload).
            await chat_store.append_message(
                session_id, "assistant",
                f"Published '{published['title']}' — join code {published['code']}",
                tool_name="publish_assessment", tool_payload=published,
            )
            await chat_store.mark_published(session_id, published["assessment_id"])
    except Exception as exc:  # noqa: BLE001 — surfaced to the user, not swallowed
        logger.exception("Agent turn failed for session %s", session_id)
        await chat_store.append_message(session_id, "assistant", f"Something went wrong: {exc}")
    finally:
        await chat_store.finish_processing(session_id)
