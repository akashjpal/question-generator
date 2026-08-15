"""
Prompt builders for the generate <-> judge loop.

`build_generation_prompt` is `question_generator._build_prompt` moved
as-is (identical STRICT RULES / OUTPUT FORMAT), minus the old
`_MAX_TEXT_CHARS` truncation — `chunking.py` is responsible for handing
this a source_text that's already a sane size, so re-truncating here would
silently reintroduce the exact bug this rewrite fixes. Whitespace is still
normalized (collapsed + stripped) for prompt hygiene.
"""
import re

_DIFFICULTY_GUIDANCE = {
    "easy": "factual recall, definitions, and basic understanding",
    "medium": "application of concepts and moderate analysis",
    "hard": "complex analysis, tricky distractors, and multi-step reasoning",
    "expert": "synthesis, evaluation, and edge-case scenarios",
}


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def build_generation_prompt(text: str, topic: str, difficulty: str, num_questions: int) -> str:
    guidance = _DIFFICULTY_GUIDANCE.get(difficulty, "standard understanding")
    source_text = _normalize_whitespace(text)
    return f"""You are an expert educator creating multiple-choice questions from the provided content.

--- CONTENT START ---
{source_text}
--- CONTENT END ---

TASK: Generate exactly {num_questions} unique multiple-choice questions about "{topic}" at "{difficulty}" difficulty.
DIFFICULTY GUIDANCE: Focus on {guidance}.

STRICT RULES:
1. Each question must have exactly 4 answer options labeled "A. ...", "B. ...", "C. ...", "D. ..."
2. The "correct_option" field must be exactly one letter: "A", "B", "C", or "D"
3. All questions must be derived directly from the CONTENT provided above
4. No duplicate questions or semantically equivalent paraphrases
5. Return ONLY a raw JSON array — no markdown, no code fences, no extra text

OUTPUT FORMAT (strictly follow this schema):
[
  {{
    "question_text": "What is ...?",
    "options": ["A. First option", "B. Second option", "C. Third option", "D. Fourth option"],
    "correct_option": "B",
    "explanation": "Because ..."
  }}
]"""


def build_judge_prompt(
    candidates: list[dict], topic: str, difficulty: str, already_collected: list[dict]
) -> str:
    already_lines = "\n".join(
        f"- {q['question_text']}" for q in already_collected
    ) or "(none yet)"

    candidate_blocks = []
    for i, c in enumerate(candidates):
        options = "\n".join(f"    {opt}" for opt in c.get("options", []))
        candidate_blocks.append(
            f"[{i}] Question: {c['question_text']}\n{options}"
        )
    candidates_text = "\n\n".join(candidate_blocks)

    return f"""You are a strict quality reviewer for multiple-choice questions.

TOPIC: "{topic}"
REQUESTED DIFFICULTY: "{difficulty}"

--- ALREADY ACCEPTED QUESTIONS (for duplicate checking) ---
{already_lines}
--- END ALREADY ACCEPTED QUESTIONS ---

--- CANDIDATE QUESTIONS TO REVIEW (0-indexed) ---
{candidates_text}
--- END CANDIDATE QUESTIONS ---

TASK: Review each candidate question above and decide whether to accept or reject it.

Reject a candidate if ANY of the following is true:
1. It is not genuinely about the topic "{topic}".
2. Its difficulty/reasoning depth does not match the requested "{difficulty}" level.
3. It is a semantic or reworded duplicate of a question in ALREADY ACCEPTED QUESTIONS.
4. It is a semantic or reworded duplicate of another candidate at an EARLIER index in this
   same batch (i.e. if candidates [2] and [5] mean the same thing, reject [5] but you may
   accept [2]).

Otherwise, accept it.

Return ONLY a raw JSON object — no markdown, no code fences, no extra text — with this exact
shape:
{{
  "decisions": [
    {{"index": 0, "accept": true, "reason": "on-topic, matches difficulty, not a duplicate"}},
    {{"index": 1, "accept": false, "reason": "off-topic"}}
  ]
}}

Include exactly one decision object per candidate index, covering every index from 0 to
{len(candidates) - 1}."""
