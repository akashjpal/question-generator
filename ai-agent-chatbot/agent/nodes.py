"""
Graph nodes.

planner is the only LLM-calling node; poll_generation is deterministic
logic kept out of the tool-calling loop entirely (see
agent/tools/langchain_tools.py's module docstring for why). Both nodes write
live progress (chat_store.set_progress) so the frontend can poll
GET /sessions/{id} and show what the agent is doing right now.
"""
import asyncio
import logging

from langchain_core.messages import AIMessage, SystemMessage

import config
from agent.prompts import build_system_prompt
from agent.request_context import get_client
from agent.tools.qgen_api_client import QGenApiError
from persistence import chat_store

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 2
MAX_POLL_ATTEMPTS = 150  # ~5 minute ceiling before giving up


def make_planner_node(llm_with_tools):
    async def planner_node(state):
        system = SystemMessage(content=build_system_prompt(
            state.get("pending_file"),
            state.get("job_status"),
            state.get("last_assessment_id"),
        ))
        response = await llm_with_tools.ainvoke([system, *state["messages"]])

        tool_calls = getattr(response, "tool_calls", None)
        if tool_calls:
            names = [tc["name"] for tc in tool_calls]
            logger.info("planner[%s]: calling %s", state["session_id"], names)
            tool_name = tool_calls[0]["name"]
            await chat_store.set_progress(state["session_id"], tool_name, f"Calling {tool_name}…")
            return {"messages": [response]}

        # response.content isn't guaranteed to be a plain string for every
        # provider (some return structured content blocks, e.g. for
        # tool-calling continuity metadata) — `.text` normalizes whatever
        # shape it is to plain text; used for chat_log/DB storage and
        # logging only. The raw `response` object (whatever shape .content
        # is) still goes into state["messages"] as-is, since the provider
        # may need its own original structured content back to correctly
        # continue reasoning within this same run.
        final_text = response.text
        logger.info("planner[%s]: final answer (%d chars)", state["session_id"], len(final_text))

        chat_log = []
        if final_text:
            chat_log.append({"role": "assistant", "content": final_text})
        return {"messages": [response], "chat_log": chat_log}

    return planner_node


def _status_text(status: int) -> str:
    return {
        config.STATUS_QUEUED: "Queued for generation…",
        config.STATUS_PROCESSING: "Generating questions…",
        config.STATUS_COMPLETED: "Generation complete.",
        config.STATUS_FAILED: "Generation failed.",
    }.get(status, f"Status: {status}")


def _terminal_result(job_id: str, job_status: int, chat_log_content: str, directive: str) -> dict:
    """Builds a Command-shaped update for a poll loop that just ended.

    `chat_log_content` is the short, factual status label persisted to the
    DB (and re-shown to the LLM as "[generate_questions] <this>" on FUTURE
    turns via messages_from_rows — kept terse and consistent with
    _status_text()'s vocabulary). `directive` is the richer, more explicit
    guidance injected into state["messages"] for THIS turn's immediate
    planner call only — spelling out what actually happened and what to do
    next, since a bare status label alone was observed to sometimes get
    misread by the model as "still in progress" rather than "already over".
    """
    return {
        "job_status": job_status,
        "messages": [AIMessage(content=f"[generate_questions] {directive}")],
        "chat_log": [{
            "role": "tool", "content": chat_log_content,
            "tool_name": "generate_questions",
            "tool_payload": {"job_id": job_id, "job_status": job_status},
        }],
    }


async def poll_generation_node(state):
    job_id = state.get("job_id")
    session_id = state["session_id"]
    if not job_id:
        return {}

    client = get_client()
    status = state.get("job_status", config.STATUS_QUEUED)
    timed_out = True

    for _ in range(MAX_POLL_ATTEMPTS):
        try:
            status = await client.check_generation_status(job_id)
        except QGenApiError as exc:
            logger.error("poll_generation: status check failed: %s", exc)
            await chat_store.set_progress(session_id, "generate_questions", f"Couldn't check generation status: {exc}")
            return _terminal_result(
                job_id, config.STATUS_FAILED, "Couldn't check generation status.",
                f"Checking on job {job_id} failed with an error ({exc}) — this is a terminal outcome, not "
                "still in progress. Tell the teacher plainly that checking generation status failed and "
                "ask if they'd like to retry.",
            )

        await chat_store.set_progress(session_id, "generate_questions", _status_text(status))

        if status in (config.STATUS_COMPLETED, config.STATUS_FAILED):
            timed_out = False
            break
        await asyncio.sleep(POLL_INTERVAL_SECONDS)

    if timed_out:
        return _terminal_result(
            job_id, status, "Generation timed out.",
            f"Job {job_id} did not finish after several minutes of polling — this is a terminal outcome for "
            "this turn, not still in progress. Tell the teacher plainly that generation is taking unusually "
            "long and ask if they'd like to try again.",
        )

    if status == config.STATUS_FAILED:
        return _terminal_result(
            job_id, status, "Generation failed.",
            f"Job {job_id} finished with a FAILED status on the server side — this is a terminal outcome, "
            "not still in progress. Tell the teacher plainly that generation failed and ask if they'd like "
            "to retry with the same details or try a different PDF/topic. Do not say you are still waiting "
            "or that you'll confirm once it's done — it is already done, and it failed.",
        )

    try:
        questions = await client.get_generated_questions(job_id)
    except QGenApiError as exc:
        logger.error("poll_generation: fetch questions failed: %s", exc)
        await chat_store.set_progress(session_id, "generate_questions", f"Generation finished but questions couldn't be fetched: {exc}")
        return _terminal_result(
            job_id, config.STATUS_FAILED, "Generation finished but questions couldn't be fetched.",
            f"Job {job_id} completed, but fetching the generated questions failed ({exc}) — this is a "
            "terminal outcome. Tell the teacher plainly what happened and ask if they'd like to retry.",
        )

    return {
        "job_status": status,
        "questions": questions,
        "messages": [AIMessage(
            content=f"[generate_questions] Job {job_id} completed successfully — {len(questions)} questions "
            "were generated and are ready. This is a terminal outcome, not still in progress. Briefly "
            "summarize what was generated and proceed per your instructions (confirm details then publish, "
            "or publish directly if the teacher already said to go ahead)."
        )],
        "chat_log": [{
            "role": "tool", "content": f"Fetched {len(questions)} generated questions.",
            "tool_name": "generate_questions",
            "tool_payload": {"job_id": job_id, "job_status": status, "questions": questions},
        }],
    }


def route_after_planner(state) -> str:
    last = state["messages"][-1]
    if getattr(last, "tool_calls", None):
        return "tools"
    return "end"


def route_after_tools(state) -> str:
    """After generate_questions sets job_id (and before questions exist), poll.
    Any other tool outcome goes straight back to the planner."""
    if state.get("job_id") and state.get("questions") is None and state.get("job_status") != config.STATUS_FAILED:
        return "poll_generation"
    return "planner"
