"""
LLM-callable tools bound to the planner node.

Design note: tools that need to read/write structured pipeline state
(pending file, fetched questions, publish result) use LangGraph's
InjectedState/Command pattern rather than asking the LLM to reproduce large
JSON blobs (e.g. a full question list) as tool-call arguments — that would be
slow, token-expensive, and error-prone (mangled JSON, dropped fields). The
LLM only ever supplies the semantic fields it actually needs to decide:
topic/difficulty/question-count for generation, title/subject/time-limit for
publishing, and the changed fields for updating.

Status polling and fetching generated questions are deliberately NOT LLM
tools — see agent/nodes.py poll_generation_node — for the same reason the
plan calls out for polling itself: there's no real "decision" in either
step, so keeping them as deterministic follow-ups saves a tool-call round
trip and avoids the LLM ever handling raw question payloads.

Each tool also appends a "chat_log" entry (see agent/state.py) describing
its outcome — this is what agent/runner.py flushes to agent_chat_messages
after the turn completes, and what agent/state.py's extract_job_fields/
extract_questions read back on the next turn (state is rebuilt from these
entries, there's no checkpointer).
"""
import random
from datetime import datetime, timezone
from typing import Annotated

from langchain_core.messages import ToolMessage
from langchain_core.tools import InjectedToolCallId, tool
from langgraph.prebuilt import InjectedState
from langgraph.types import Command

import config
from agent.request_context import get_client
from agent.tools.qgen_api_client import QGenApiError


def generate_join_code() -> str:
    """Mirrors create-assessment.ts's client-side generateCode()."""
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return "".join(random.choice(chars) for _ in range(6))


def generate_assessment_id() -> int:
    """Mirrors create-assessment.ts's client-generated random numeric id."""
    return random.randint(1, 2**32 - 1)


@tool
async def generate_questions(
    topic: str,
    difficulty: str,
    num_questions: int,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """Start MCQ generation from the PDF the teacher has already attached to
    this chat session. difficulty must be one of: easy, medium, hard, expert.
    num_questions should be a small positive integer (the existing UI
    defaults to 10). Call this only once title/subject/topic/difficulty/
    num_questions/time_limit are all known — ask the teacher first if any
    are missing."""
    pending = state.get("pending_file")
    if not pending:
        return Command(update={"messages": [ToolMessage(
            content="No PDF is attached yet — ask the teacher to attach one before generating questions.",
            tool_call_id=tool_call_id,
        )]})

    client = get_client()
    try:
        result = await client.start_generation(
            pending["file_id"], pending["file_name"], topic, difficulty, num_questions,
        )
    except QGenApiError as exc:
        return Command(update={"messages": [ToolMessage(
            content=f"Failed to start generation: {exc}", tool_call_id=tool_call_id,
        )]})

    job_id = str(result.get("jobId"))
    content = f"Started generating {num_questions} {difficulty} questions on '{topic}' (job {job_id})."

    return Command(update={
        "job_id": job_id,
        "job_status": config.STATUS_QUEUED,
        "chat_log": [{
            "role": "tool", "content": content, "tool_name": "generate_questions",
            "tool_payload": {"job_id": job_id, "job_status": config.STATUS_QUEUED},
        }],
        "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
    })


@tool
async def publish_assessment(
    title: str,
    subject: str,
    topic: str,
    difficulty: str,
    time_limit: int,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
    description: str = "",
) -> Command:
    """Publish the generated quiz. Only call this after generation has
    completed (questions are available) and after confirming title, subject,
    and time_limit (minutes) with the teacher. Generates a join code,
    publishes via the platform API, and returns the attempt link."""
    questions = state.get("questions") or []
    if not questions:
        return Command(update={"messages": [ToolMessage(
            content="No generated questions available yet — generation must complete before publishing.",
            tool_call_id=tool_call_id,
        )]})

    client = get_client()

    code = generate_join_code()
    for _ in range(5):
        try:
            if await client.check_join_code_available(code):
                break
        except QGenApiError:
            break
        code = generate_join_code()

    assessment_id = generate_assessment_id()
    now = datetime.now(timezone.utc).isoformat()

    assessment = {
        "id": assessment_id,
        "title": title,
        "subject": subject,
        "topic": topic,
        "difficulty": difficulty.lower(),
        "description": description,
        "questions": questions,
        "questionsCount": len(questions),
        "status": 1,
        "code": code,
        "timeLimit": time_limit,
        "createdBy": state.get("user_id", ""),
        "updatedAt": now,
        "publishedAt": now,
    }

    try:
        await client.publish_assessment(assessment)
        confirmed = await client.get_assessment(assessment_id)
    except QGenApiError as exc:
        return Command(update={"messages": [ToolMessage(
            content=f"Failed to publish assessment: {exc}", tool_call_id=tool_call_id,
        )]})

    if not confirmed:
        return Command(update={"messages": [ToolMessage(
            content="Publish call succeeded but the assessment could not be confirmed afterwards.",
            tool_call_id=tool_call_id,
        )]})

    attempt_link = f"{config.FRONTEND_ORIGIN}/attempt/{assessment_id}"
    published = {
        "assessment_id": assessment_id,
        "title": confirmed.get("title", title),
        "code": confirmed.get("code", code),
        "attempt_link": attempt_link,
        "time_limit": confirmed.get("timeLimit", time_limit),
        "questions_count": confirmed.get("questionsCount", len(questions)),
    }
    content = f"Published '{published['title']}' — join code {published['code']}, link {attempt_link}"

    return Command(update={
        "published": published,
        "last_assessment_id": assessment_id,
        "chat_log": [{
            "role": "tool", "content": content, "tool_name": "publish_assessment",
            "tool_payload": published,
        }],
        "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
    })


@tool
async def update_assessment(
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
    title: str | None = None,
    subject: str | None = None,
    topic: str | None = None,
    difficulty: str | None = None,
    description: str | None = None,
    time_limit: int | None = None,
) -> Command:
    """Update quiz metadata (title/subject/topic/difficulty/description/time
    limit) on the most recently published assessment in this session. Does
    NOT change individual question text/options/answers — only metadata.
    Only call this after publish_assessment has already succeeded once in
    this session, and only for fields the teacher explicitly wants changed
    (leave the rest unset)."""
    assessment_id = state.get("last_assessment_id")
    if not assessment_id:
        return Command(update={"messages": [ToolMessage(
            content="No published assessment yet in this session to update — publish one first.",
            tool_call_id=tool_call_id,
        )]})

    client = get_client()
    try:
        current = await client.get_assessment(assessment_id)
    except QGenApiError as exc:
        return Command(update={"messages": [ToolMessage(
            content=f"Failed to fetch the current assessment: {exc}", tool_call_id=tool_call_id,
        )]})
    if not current:
        return Command(update={"messages": [ToolMessage(
            content=f"Could not find assessment {assessment_id} to update.", tool_call_id=tool_call_id,
        )]})

    updated = dict(current)
    changed: dict[str, object] = {}
    for key, value in (
        ("title", title), ("subject", subject), ("topic", topic), ("description", description),
    ):
        if value is not None:
            updated[key] = value
            changed[key] = value
    if difficulty is not None:
        updated["difficulty"] = difficulty.lower()
        changed["difficulty"] = updated["difficulty"]
    if time_limit is not None:
        updated["timeLimit"] = time_limit
        changed["timeLimit"] = time_limit
    updated["updatedAt"] = datetime.now(timezone.utc).isoformat()

    if not changed:
        return Command(update={"messages": [ToolMessage(
            content="No fields to update were provided.", tool_call_id=tool_call_id,
        )]})

    try:
        await client.update_assessment(updated)
    except QGenApiError as exc:
        return Command(update={"messages": [ToolMessage(
            content=f"Failed to update assessment: {exc}", tool_call_id=tool_call_id,
        )]})

    content = f"Updated assessment #{assessment_id}: {changed}"
    return Command(update={
        "chat_log": [{
            "role": "tool", "content": content, "tool_name": "update_assessment",
            "tool_payload": changed,
        }],
        "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
    })


ALL_TOOLS = [generate_questions, publish_assessment, update_assessment]
