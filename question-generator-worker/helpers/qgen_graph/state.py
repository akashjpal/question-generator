"""
LangGraph state for the generate <-> judge question-generation loop.

Mirrors ai-agent-chatbot/agent/state.py's convention: a single TypedDict
threaded through every node, with `round`/`max_rounds` driving the
conditional loop-back edge (see nodes.route_after_judge).
"""
from typing import TypedDict


class QuestionGenState(TypedDict):
    source_text: str
    topic: str
    difficulty: str
    target_count: int
    collected: list[dict]      # accepted questions so far (question_text/options/correct_option/explanation)
    candidates: list[dict]     # this round's MD5-deduped, not-yet-judged candidates (scratch space)
    seen_hashes: set[str]      # MD5 fingerprints of everything in `collected`
    round: int                 # 0-indexed round counter
    max_rounds: int            # default 5
