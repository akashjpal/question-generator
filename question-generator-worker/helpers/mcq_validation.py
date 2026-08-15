import hashlib
import json
import logging
import re

logger = logging.getLogger(__name__)


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
