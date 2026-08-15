"""
Graph nodes for the generate <-> judge question-generation loop.

Both nodes follow the make_*_node(llm) factory pattern from
ai-agent-chatbot/agent/nodes.py: the LLM is injected so tests can swap in a
FakeLLM instead of hitting OpenRouter for real.
"""
import json
import logging
import re

from helpers.mcq_validation import _deduplicate, _fingerprint, _parse_and_validate
from helpers.qgen_graph import prompts

logger = logging.getLogger(__name__)


def _parse_judge_decisions(raw: str) -> dict:
    """Tolerant parse of the judge's {"decisions": [...]} JSON, mirroring
    _parse_and_validate's tolerance for markdown fences / surrounding prose."""
    clean = re.sub(r"```(?:json)?\s*", "", raw).strip().strip("`").strip()
    start = clean.find("{")
    end = clean.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object found in judge response")
    return json.loads(clean[start:end])


def make_generate_node(llm):
    def generate_node(state):
        remaining = state["target_count"] - len(state["collected"])
        round_num = state["round"] + 1
        logger.info(
            "[Generate] Round %d/%d — requesting %d question(s) on '%s' (%s difficulty)",
            round_num, state["max_rounds"], remaining, state["topic"], state["difficulty"],
        )
        try:
            prompt = prompts.build_generation_prompt(
                state["source_text"], state["topic"], state["difficulty"], remaining
            )
            raw = llm.invoke(prompt).content
            parsed = _parse_and_validate(raw)
            deduped, _ = _deduplicate(parsed, state["seen_hashes"])
        except Exception as exc:
            logger.warning("[Generate] Round %d failed, producing 0 candidates: %s", round_num, exc)
            return {"candidates": []}
        logger.info(
            "[Generate] Round %d — LLM returned %d question(s), %d survived exact-duplicate filtering",
            round_num, len(parsed), len(deduped),
        )
        return {"candidates": deduped}

    return generate_node


def make_judge_node(llm):
    def judge_node(state):
        round_num = state["round"] + 1
        candidates = state["candidates"]
        if not candidates:
            logger.info("[Judge] Round %d — no candidates to review", round_num)
            accepted: list[dict] = []
        else:
            try:
                prompt = prompts.build_judge_prompt(
                    candidates, state["topic"], state["difficulty"], state["collected"]
                )
                raw = llm.invoke(prompt).content
                decisions = _parse_judge_decisions(raw)
                accepted = [
                    candidates[d["index"]]
                    for d in decisions["decisions"]
                    if d.get("accept") and 0 <= d["index"] < len(candidates)
                ]
                for d in decisions["decisions"]:
                    if 0 <= d["index"] < len(candidates):
                        logger.info(
                            "[Judge] Round %d — candidate %d %s: %s",
                            round_num, d["index"],
                            "accepted" if d.get("accept") else "rejected",
                            d.get("reason", ""),
                        )
            except Exception as exc:
                logger.warning("[Judge] Round %d failed, accepting 0 candidates: %s", round_num, exc)
                accepted = []

        new_collected = state["collected"] + accepted
        new_hashes = set(state["seen_hashes"])
        for q in accepted:
            new_hashes.add(_fingerprint(q["question_text"]))

        logger.info(
            "[Judge] Round %d — accepted %d/%d candidate(s); total %d/%d question(s) so far",
            round_num, len(accepted), len(candidates), len(new_collected), state["target_count"],
        )

        return {
            "collected": new_collected,
            "seen_hashes": new_hashes,
            "round": state["round"] + 1,
        }

    return judge_node


def route_after_judge(state) -> str:
    if len(state["collected"]) < state["target_count"] and state["round"] < state["max_rounds"]:
        return "generate"
    return "end"
