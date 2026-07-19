import os

import pytest
from langchain_core.messages import AIMessage

import config
from agent.nodes import route_after_planner, route_after_tools


def _state(**overrides):
    base = {"messages": [AIMessage(content="hi")], "job_id": None, "questions": None, "job_status": None}
    base.update(overrides)
    return base


def test_route_after_planner_goes_to_tools_when_tool_calls_present():
    msg = AIMessage(content="", tool_calls=[{"name": "generate_questions", "args": {}, "id": "call_1"}])
    assert route_after_planner(_state(messages=[msg])) == "tools"


def test_route_after_planner_goes_to_end_when_no_tool_calls():
    msg = AIMessage(content="All set.")
    assert route_after_planner(_state(messages=[msg])) == "end"


def test_route_after_tools_polls_when_generation_just_started():
    state = _state(job_id="job-1", questions=None, job_status=config.STATUS_QUEUED)
    assert route_after_tools(state) == "poll_generation"


def test_route_after_tools_goes_to_planner_when_no_job_in_flight():
    assert route_after_tools(_state()) == "planner"


def test_route_after_tools_goes_to_planner_once_questions_are_present():
    state = _state(job_id="job-1", questions=[{"id": "q1"}], job_status=config.STATUS_COMPLETED)
    assert route_after_tools(state) == "planner"


def test_route_after_tools_goes_to_planner_when_generation_failed():
    state = _state(job_id="job-1", questions=None, job_status=config.STATUS_FAILED)
    assert route_after_tools(state) == "planner"


@pytest.mark.skipif(not os.getenv("OPENROUTER_API_KEY"), reason="requires OPENROUTER_API_KEY to construct ChatOpenAI")
def test_graph_topology_has_no_intake_or_responder_nodes():
    from agent.graph import build_graph

    graph = build_graph()
    node_names = set(graph.get_graph().nodes.keys())

    assert {"planner", "tools", "poll_generation"} <= node_names
    assert "intake" not in node_names
    assert "responder" not in node_names
