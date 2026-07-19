import hashlib
import json
import logging
import os
import re

from openai import OpenAI
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

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "moonshotai/kimi-k2")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

_MAX_OUTER_RETRIES = 3        # retries for "not enough questions" scenario
_MAX_API_RETRIES = 3          # retries for transient API failures
_MAX_TEXT_CHARS = 4_500       # trim input to stay under model context limits
_MIN_COMPLETION_TOKENS = 900
_TOKENS_PER_QUESTION = 180
_MAX_COMPLETION_TOKENS = 2_400


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

_DIFFICULTY_GUIDANCE = {
    "easy": "factual recall, definitions, and basic understanding",
    "medium": "application of concepts and moderate analysis",
    "hard": "complex analysis, tricky distractors, and multi-step reasoning",
    "expert": "synthesis, evaluation, and edge-case scenarios",
}


def _compact_source_text(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    return normalized[:_MAX_TEXT_CHARS]


def _completion_token_budget(num_questions: int) -> int:
    estimated = max(_MIN_COMPLETION_TOKENS, num_questions * _TOKENS_PER_QUESTION)
    return min(_MAX_COMPLETION_TOKENS, estimated)


def _build_prompt(text: str, topic: str, difficulty: str, num_questions: int) -> str:
    guidance = _DIFFICULTY_GUIDANCE.get(difficulty, "standard understanding")
    source_text = _compact_source_text(text)
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
        raise ValueError("No JSON array found in LLM response")

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
# OpenRouter API call (with tenacity retry for transient failures)
# ---------------------------------------------------------------------------

@retry(
    reraise=True,
    stop=stop_after_attempt(_MAX_API_RETRIES),
    wait=wait_exponential(multiplier=1, min=2, max=16),
    retry=retry_if_exception_type(Exception),
)
def _call_openrouter(client: OpenAI, model_name: str, prompt: str, max_output_tokens: int) -> str:
    # response_format={"type": "json_object"} was tried and rejected by this
    # model/provider combo on OpenRouter ("does not support feature:
    # structured-outputs") — relying on prompt instructions + the tolerant
    # parsing in _parse_and_validate() instead, same as the original design.
    completion = client.chat.completions.create(
        model=model_name,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=max_output_tokens,
        top_p=1,
    )
    raw = completion.choices[0].message.content
    if not raw:
        raise ValueError("Empty response received from OpenRouter API")
    return raw


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

def generate_questions_with_llm(
    text: str, topic: str, difficulty: str, num_questions: int
) -> list[dict]:
    """Call OpenRouter (Kimi K2 by default) to generate MCQs; retries until
    num_questions unique are collected."""
    if not OPENROUTER_API_KEY:
        raise EnvironmentError("OPENROUTER_API_KEY is not set in environment variables")

    client = OpenAI(api_key=OPENROUTER_API_KEY, base_url=OPENROUTER_BASE_URL)

    collected: list[dict] = []
    seen_hashes: set[str] = set()

    for attempt in range(1, _MAX_OUTER_RETRIES + 1):
        remaining = num_questions - len(collected)
        if remaining <= 0:
            break

        logger.info(
            "[OpenRouter] Attempt %d/%d — requesting %d questions",
            attempt,
            _MAX_OUTER_RETRIES,
            remaining,
        )

        try:
            prompt = _build_prompt(text, topic, difficulty, remaining)
            max_output_tokens = _completion_token_budget(remaining)
            logger.info(
                "[OpenRouter] Using %d prompt chars and %d max output tokens",
                min(len(_compact_source_text(text)), _MAX_TEXT_CHARS),
                max_output_tokens,
            )
            raw = _call_openrouter(client, OPENROUTER_MODEL, prompt, max_output_tokens)
            parsed = _parse_and_validate(raw)
            new_unique, seen_hashes = _deduplicate(parsed, seen_hashes)
            collected.extend(new_unique)
            logger.info(
                "[OpenRouter] +%d new unique questions (total: %d/%d)",
                len(new_unique),
                len(collected),
                num_questions,
            )
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("[OpenRouter] Parse error on attempt %d: %s", attempt, exc)
        except Exception as exc:
            logger.error("[OpenRouter] API error on attempt %d: %s", attempt, exc)

    if not collected:
        raise RuntimeError(
            f"Failed to generate any questions after {_MAX_OUTER_RETRIES} attempts"
        )

    if len(collected) < num_questions:
        logger.warning(
            "[OpenRouter] Only generated %d/%d questions", len(collected), num_questions
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
