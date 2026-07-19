r"""
LangGraph wiring.

START -> planner --(tool_calls)--> tools --(after generate_questions)--> poll_generation -> planner
                      \--(no tool_calls)--> END
                                             tools --(other tool)--> planner

No checkpointer: every HTTP turn compiles and invokes a fresh graph with
state rebuilt from Supabase (agent/state.py's build_state_from_rows) —
see agent/runner.py.
"""
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI

import config
from agent.nodes import (
    make_planner_node,
    poll_generation_node,
    route_after_planner,
    route_after_tools,
)
from agent.state import AgentState
from agent.tools.langchain_tools import ALL_TOOLS

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def _build_llm():
    return ChatOpenAI(
        model=config.AGENT_OPENROUTER_MODEL,
        api_key=config.OPENROUTER_API_KEY,
        base_url=OPENROUTER_BASE_URL,
        temperature=0.2,
        # Explicit cap required: OpenRouter rejects a request whose model's
        # default max output exceeds what the account's remaining credit
        # balance can cover (observed as a 402 on this model's 65536-token
        # default) — 1000 is comfortably enough for a tool-call decision or
        # a short reply and stays well under typical low-balance limits.
        max_tokens=1000,
    ).bind_tools(ALL_TOOLS)


def build_graph():
    llm_with_tools = _build_llm()
    planner_node = make_planner_node(llm_with_tools)

    graph = StateGraph(AgentState)
    graph.add_node("planner", planner_node)
    graph.add_node("tools", ToolNode(ALL_TOOLS))
    graph.add_node("poll_generation", poll_generation_node)

    graph.add_edge(START, "planner")
    graph.add_conditional_edges("planner", route_after_planner, {
        "tools": "tools",
        "end": END,
    })
    graph.add_conditional_edges("tools", route_after_tools, {
        "poll_generation": "poll_generation",
        "planner": "planner",
    })
    graph.add_edge("poll_generation", "planner")

    return graph.compile()


def get_graph():
    """Compiled fresh every call — no checkpointer to amortize, and the LLM
    client itself is cheap to construct."""
    return build_graph()
