import hashlib
import json
import logging
import os
import re

from groq import Groq
from dotenv import load_dotenv
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from helpers.supabase_client import supabase

load_dotenv()

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

_MAX_OUTER_RETRIES = 3        # retries for "not enough questions" scenario
_MAX_API_RETRIES = 3          # retries for transient Gemini API failures
_MAX_TEXT_CHARS = 12_000      # trim input to stay within context window


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

_DIFFICULTY_GUIDANCE = {
    "easy": "factual recall, definitions, and basic understanding",
    "medium": "application of concepts and moderate analysis",
    "hard": "complex analysis, tricky distractors, and multi-step reasoning",
    "expert": "synthesis, evaluation, and edge-case scenarios",
}


def _build_prompt(text: str, topic: str, difficulty: str, num_questions: int) -> str:
    guidance = _DIFFICULTY_GUIDANCE.get(difficulty, "standard understanding")
    return f"""You are an expert educator creating multiple-choice questions from the provided content.

--- CONTENT START ---
{text[:_MAX_TEXT_CHARS]}
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


# ---------------------------------------------------------------------------
# Parsing + validation
# ---------------------------------------------------------------------------

def _parse_and_validate(raw: str) -> list[dict]:
    """Strip markdown fences, parse JSON, and validate each MCQ item."""
    # Remove code fences in case the model includes them despite instructions
    clean = re.sub(r"```(?:json)?\s*", "", raw).strip().strip("`").strip()

    # Locate the JSON array boundaries to tolerate any surrounding prose
    start = clean.find("[")
    end = clean.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON array found in Gemini response")

    data = json.loads(clean[start:end])

    validated: list[dict] = []
    required_keys = ("question_text", "options", "correct_option", "explanation")

    for i, item in enumerate(data):
        missing = [k for k in required_keys if k not in item]
        if missing:
            logger.warning("Question %d missing fields %s — skipping", i, missing)
            continue
        if not isinstance(item["options"], list) or len(item["options"]) != 4:
            logger.warning("Question %d does not have exactly 4 options — skipping", i)
            continue
        correct = str(item["correct_option"]).strip().upper()
        if correct not in ("A", "B", "C", "D"):
            logger.warning("Question %d has invalid correct_option '%s' — skipping", i, correct)
            continue
        validated.append(
            {
                "question_text": str(item["question_text"]).strip(),
                "options": [str(o).strip() for o in item["options"]],
                "correct_option": correct,
                "explanation": str(item["explanation"]).strip(),
            }
        )

    return validated


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

def _fingerprint(question_text: str) -> str:
    normalized = re.sub(r"\s+", " ", question_text.strip().lower())
    return hashlib.md5(normalized.encode()).hexdigest()


def _deduplicate(
    new_questions: list[dict], seen_hashes: set[str]
) -> tuple[list[dict], set[str]]:
    """Return only questions whose fingerprints aren't in seen_hashes, updating the set."""
    unique: list[dict] = []
    hashes = set(seen_hashes)
    for q in new_questions:
        h = _fingerprint(q["question_text"])
        if h not in hashes:
            hashes.add(h)
            unique.append(q)
    return unique, hashes


# ---------------------------------------------------------------------------
# Groq API call (with tenacity retry for transient failures)
# ---------------------------------------------------------------------------

@retry(
    reraise=True,
    stop=stop_after_attempt(_MAX_API_RETRIES),
    wait=wait_exponential(multiplier=1, min=2, max=16),
    retry=retry_if_exception_type(Exception),
)
def _call_groq(client: Groq, model_name: str, prompt: str) -> str:
    completion = client.chat.completions.create(
        model=model_name,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_completion_tokens=8192,
        top_p=1,
        reasoning_effort="medium",
        stream=False,
        stop=None,
    )
    raw = completion.choices[0].message.content
    if not raw:
        raise ValueError("Empty response received from Groq API")
    return raw


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

def generate_questions_with_llm(
    text: str, topic: str, difficulty: str, num_questions: int
) -> list[dict]:
    """Call Groq to generate MCQs; retries until num_questions unique are collected."""
    if not GROQ_API_KEY:
        raise EnvironmentError("GROQ_API_KEY is not set in environment variables")

    client = Groq(api_key=GROQ_API_KEY)

    collected: list[dict] = []
    seen_hashes: set[str] = set()

    for attempt in range(1, _MAX_OUTER_RETRIES + 1):
        remaining = num_questions - len(collected)
        if remaining <= 0:
            break

        logger.info(
            "[Groq] Attempt %d/%d — requesting %d questions",
            attempt,
            _MAX_OUTER_RETRIES,
            remaining,
        )

        try:
            prompt = _build_prompt(text, topic, difficulty, remaining)
            raw = _call_groq(client, GROQ_MODEL, prompt)
            parsed = _parse_and_validate(raw)
            new_unique, seen_hashes = _deduplicate(parsed, seen_hashes)
            collected.extend(new_unique)
            logger.info(
                "[Groq] +%d new unique questions (total: %d/%d)",
                len(new_unique),
                len(collected),
                num_questions,
            )
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("[Groq] Parse error on attempt %d: %s", attempt, exc)
        except Exception as exc:
            logger.error("[Groq] API error on attempt %d: %s", attempt, exc)

    if not collected:
        raise RuntimeError(
            f"Failed to generate any questions after {_MAX_OUTER_RETRIES} attempts"
        )

    if len(collected) < num_questions:
        logger.warning(
            "[Groq] Only generated %d/%d questions", len(collected), num_questions
        )

    return collected[:num_questions]


def save_questions_to_db(questions: list[dict], job_id: str) -> list[dict]:
    """Insert generated questions into Supabase 'ai-generated-questions' table."""
    if not questions:
        return []

    rows = [
        {
            "jobId": job_id,
            "question_text": q["question_text"],
            "options": q["options"],
            "correct_options": q["correct_option"],
            "explanation": q["explanation"],
        }
        for q in questions
    ]

    result = supabase.table("ai-generated-questions").insert(rows).execute()
    logger.info("[DB] Saved %d questions for job_id=%s", len(result.data), job_id)
    return result.data
