"""
LangGraph wiring for the generate <-> judge question-generation loop.

START -> generate -> judge --(short of target, round < max_rounds)--> generate
                            \\--(otherwise)--> END

Mirrors ai-agent-chatbot/agent/graph.py's structure/style.
"""
import logging
import os

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph

from helpers.qgen_graph.nodes import make_generate_node, make_judge_node, route_after_judge
from helpers.qgen_graph.state import QuestionGenState

load_dotenv()

logger = logging.getLogger(__name__)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def _build_llm():
    return ChatOpenAI(
        model=os.getenv("OPENROUTER_MODEL", "moonshotai/kimi-k2"),
        api_key=os.getenv("OPENROUTER_API_KEY"),
        base_url=OPENROUTER_BASE_URL,
        temperature=0.7,
        max_tokens=2400,
    )


def build_graph(llm):
    generate_node = make_generate_node(llm)
    judge_node = make_judge_node(llm)

    graph = StateGraph(QuestionGenState)
    graph.add_node("generate", generate_node)
    graph.add_node("judge", judge_node)

    graph.add_edge(START, "generate")
    graph.add_edge("generate", "judge")
    graph.add_conditional_edges("judge", route_after_judge, {
        "generate": "generate",
        "end": END,
    })

    return graph.compile()


def get_graph(llm=None):
    return build_graph(llm or _build_llm())


def run_generation(
    source_text: str,
    topic: str,
    difficulty: str,
    target_count: int,
    llm=None,
    max_rounds: int = 5,
) -> list[dict]:
    """Practical public entry point: builds initial state, runs the
    generate<->judge graph to completion, and applies the same terminal
    semantics as today's question_generator.generate_questions_with_llm."""
    logger.info(
        "[QGen] Starting generation — topic='%s', difficulty=%s, target=%d, max_rounds=%d",
        topic, difficulty, target_count, max_rounds,
    )

    initial_state: QuestionGenState = {
        "source_text": source_text,
        "topic": topic,
        "difficulty": difficulty,
        "target_count": target_count,
        "collected": [],
        "candidates": [],
        "seen_hashes": set(),
        "round": 0,
        "max_rounds": max_rounds,
    }

    result = get_graph(llm).invoke(initial_state)
    collected = result["collected"]
    rounds_used = result["round"]

    if not collected:
        logger.error(
            "[QGen] Failed to generate any questions after %d round(s) for topic='%s'",
            rounds_used, topic,
        )
        raise RuntimeError(f"Failed to generate any questions after {max_rounds} rounds")

    if len(collected) < target_count:
        logger.warning(
            "[QGen] Only generated %d/%d question(s) after %d round(s)",
            len(collected), target_count, rounds_used,
        )
    else:
        logger.info(
            "[QGen] Done — %d/%d question(s) accepted in %d round(s)",
            len(collected), target_count, rounds_used,
        )

    return collected[:target_count]
