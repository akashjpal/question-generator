import logging
import os

from dotenv import load_dotenv

from helpers.chunking import select_relevant_text
from helpers.mcq_validation import _deduplicate, _fingerprint, _parse_and_validate  # noqa: F401 (re-exported — qgen_graph/nodes.py and existing tests import these from here)
from helpers.qgen_graph.graph import run_generation
from helpers.supabase_client import supabase

load_dotenv()

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

_MAX_ROUNDS = 5  # generate<->judge rounds (raised from the old flat retry loop's 3)


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

def generate_questions_with_llm(
    text: str, topic: str, difficulty: str, num_questions: int
) -> list[dict]:
    """Generate MCQs via OpenRouter (Kimi K2 by default). Internally: curates
    the source text down to the topic-relevant portion (chunking.py — handles
    documents of any length, not just the first ~page), then runs a
    generate<->judge LangGraph loop (qgen_graph/graph.py) that checks topic
    fit, difficulty fit, and semantic-duplicate status before accepting a
    question, retrying for just the shortfall up to _MAX_ROUNDS times.
    Signature/return type unchanged — pipeline.py requires no changes."""
    if not OPENROUTER_API_KEY:
        raise EnvironmentError("OPENROUTER_API_KEY is not set in environment variables")

    source_text = select_relevant_text(text, topic, num_questions)
    return run_generation(
        source_text=source_text,
        topic=topic,
        difficulty=difficulty,
        target_count=num_questions,
        max_rounds=_MAX_ROUNDS,
    )


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

    # Idempotency: an SQS-redelivered job re-runs the whole pipeline, so clear
    # any rows a previous (failed-after-save) attempt already inserted for this
    # job_id before inserting again — otherwise retries duplicate questions.
    supabase.table("ai-generated-questions").delete().eq("jobId", job_id).execute()

    result = supabase.table("ai-generated-questions").insert(rows).execute()
    logger.info("[DB] Saved %d questions for job_id=%s", len(result.data), job_id)
    return result.data

