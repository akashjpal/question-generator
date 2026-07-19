"""
Per-request bearer-token propagation.

The teacher's Supabase JWT must reach every call to question-generator-api-ts
but must never enter AgentState — there's no checkpointer anymore, but state
is still rebuilt from and flushed to agent_chat_messages every turn, so a
token living there would leak into that table. A contextvar set once per
turn and read by tools + deterministic nodes solves this without threading
the token through every function signature or the graph state.

Contextvars propagate through `await` chains within the same task. In
agent/runner.py, the token is set synchronously right before
asyncio.create_task() so the spawned background task's copied context
already carries it.
"""
import contextvars

from agent.tools.qgen_api_client import QGenApiClient

_current_token: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_token", default=None
)


def set_current_token(token: str) -> None:
    _current_token.set(token)


def get_client() -> QGenApiClient:
    token = _current_token.get()
    if not token:
        raise RuntimeError("No bearer token set for this request context")
    return QGenApiClient(token)
