import logging

from helpers.file_downloader import download_file
from helpers.question_generator import generate_questions_with_llm, save_questions_to_db
from helpers.supabase_client import supabase
from helpers.text_extractor import extract_text_from_pdf

logger = logging.getLogger(__name__)

# Job status constants (matches ai-generated-question-status table, documented
# in CLAUDE.md's "Job Status Enum" — keep in sync with receiver.py's STATUS_FAILED).
STATUS_PROCESSING = 1
STATUS_COMPLETED = 2
STATUS_FAILED = 3


def update_job_status(job_id: str, status: int):
    try:
        supabase.table("ai-generated-question-status").update({"status": status}).eq("id", job_id).execute()
        logger.info("[DB] job_id=%s → status=%d", job_id, status)
    except Exception as exc:
        logger.error("[DB] Failed to update status for job_id=%s: %s", job_id, exc)


def run_pipeline(job_id: str, file_id: str, topic: str, difficulty: str, num_questions: int):
    """Full pipeline — called once per SQS message by the receiver."""
    update_job_status(job_id, STATUS_PROCESSING)
    file_bytes = download_file(file_id)
    result = extract_text_from_pdf(file_bytes)
    questions = generate_questions_with_llm(
        text=result["text"],
        topic=topic,
        difficulty=difficulty,
        num_questions=num_questions,
    )
    save_questions_to_db(questions, job_id)
    update_job_status(job_id, STATUS_COMPLETED)
    logger.info("✅ Completed job_id=%s — %d questions saved", job_id, len(questions))
