"""
LangGraph agent state.

There is no checkpointer anymore — every HTTP turn rebuilds state fresh from
the Supabase `agent_chat_messages`/`agent_chat_sessions` tables (the single
source of truth) via build_state_from_rows(). This also means the Supabase
bearer token can never leak into a persisted checkpoint blob (it never did
live in state to begin with — see agent/request_context.py).
"""
from typing import Annotated, Any, Optional, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.graph.message import add_messages


class PendingFile(TypedDict, total=False):
    file_id: str
    file_name: str


class PublishedQuiz(TypedDict, total=False):
    assessment_id: int
    title: str
    code: str
    attempt_link: str
    time_limit: int
    questions_count: int


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    session_id: str
    user_id: str
    pending_file: Optional[PendingFile]
    job_id: Optional[str]
    job_status: Optional[int]
    questions: Optional[list[dict[str, Any]]]
    last_assessment_id: Optional[int]
    published: Optional[PublishedQuiz]
    # Accumulated during a single run via the list-concat reducer below, then
    # flushed once to agent_chat_messages by agent/runner.py after ainvoke()
    # returns. Each entry: {"role", "content", "tool_name"?, "tool_payload"?}.
    chat_log: Annotated[list[dict[str, Any]], lambda a, b: a + b]


def messages_from_rows(rows: list[dict]) -> list[BaseMessage]:
    """Reconstructs the LLM-facing conversation from persisted rows.

    Deliberately never emits a raw ToolMessage: LangChain's tool-calling
    message protocol requires a ToolMessage to immediately follow an
    AIMessage whose tool_calls[i].id it matches, and that pairing only exists
    within a single in-memory graph.ainvoke() call. Since state is rebuilt
    fresh every HTTP turn, there's no such AIMessage to pair with across
    turns — replaying it would need a new tool_call_id column for no real
    benefit, since the LLM only needs the narrative outcome (plain text), not
    the raw tool-call protocol. Tool rows are folded into AIMessages instead,
    prefixed with the tool name for legibility.
    """
    out: list[BaseMessage] = []
    for row in rows:
        role = row.get("role")
        content = row.get("content") or ""
        if role == "user":
            out.append(HumanMessage(content=content))
        elif role == "assistant":
            out.append(AIMessage(content=content))
        elif role == "tool":
            prefix = f"[{row['tool_name']}] " if row.get("tool_name") else ""
            out.append(AIMessage(content=f"{prefix}{content}"))
    return out


def extract_job_fields(rows: list[dict]) -> tuple[Optional[str], Optional[int]]:
    """Most recent generate_questions row's tool_payload -> (job_id, job_status)."""
    for row in reversed(rows):
        if row.get("tool_name") == "generate_questions":
            payload = row.get("tool_payload") or {}
            if "job_id" in payload:
                return payload.get("job_id"), payload.get("job_status")
    return None, None


def extract_questions(rows: list[dict]) -> Optional[list[dict[str, Any]]]:
    """Most recent generate_questions row whose tool_payload carries a
    non-empty 'questions' list (the poll-completion row, not the 'started'
    row) -> that list."""
    for row in reversed(rows):
        if row.get("tool_name") == "generate_questions":
            payload = row.get("tool_payload") or {}
            questions = payload.get("questions")
            if questions:
                return questions
    return None


def build_state_from_rows(session_row: dict, user_id: str, rows: list[dict]) -> AgentState:
    job_id, job_status = extract_job_fields(rows)
    pending_file: Optional[PendingFile] = None
    if session_row.get("pending_file_id"):
        pending_file = PendingFile(
            file_id=session_row["pending_file_id"],
            file_name=session_row.get("pending_file_name") or "",
        )
    return AgentState(
        messages=messages_from_rows(rows),
        session_id=session_row["id"],
        user_id=user_id,
        pending_file=pending_file,
        job_id=job_id,
        job_status=job_status,
        questions=extract_questions(rows),
        last_assessment_id=session_row.get("last_assessment_id"),
        published=None,
        chat_log=[],
    )
