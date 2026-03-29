import asyncio
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel

from helpers.file_downloader import download_file
from helpers.question_generator import generate_questions_with_llm, save_questions_to_db
from helpers.supabase_client import supabase
from helpers.text_extractor import extract_text_from_pdf

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Job status constants (matches ai-generated-question-status table)
# ---------------------------------------------------------------------------
STATUS_PROCESSING = 1
STATUS_COMPLETED = 2
STATUS_FAILED = 3

# Internal queue — acts as the message buffer between the endpoint and the worker
_job_queue: asyncio.Queue = asyncio.Queue()


class GenerateJobRequest(BaseModel):
    jobId: str
    fileId: str
    topic: str
    difficultyLevel: str = "medium"
    numberOfQuestions: int = 10


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def update_job_status(job_id: str, status: int):
    try:
        supabase.table("ai-generated-question-status").update({"status": status}).eq("id", job_id).execute()
        logger.info("[DB] job_id=%s → status=%d", job_id, status)
    except Exception as exc:
        logger.error("[DB] Failed to update status for job_id=%s: %s", job_id, exc)


def run_pipeline(job_id: str, file_id: str, topic: str, difficulty: str, num_questions: int):
    """Full pipeline — called by the queue worker, one job at a time."""
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


# ---------------------------------------------------------------------------
# Queue worker — single coroutine, pulls and processes one job at a time
# ---------------------------------------------------------------------------

async def _queue_worker():
    logger.info("🟢 Queue worker started")
    loop = asyncio.get_event_loop()
    while True:
        job: dict = await _job_queue.get()
        job_id = job["job_id"]
        logger.info("▶ Picked up job_id=%s (queue size after: %d)", job_id, _job_queue.qsize())
        try:
            # run_pipeline is blocking (sync I/O + LLM calls) — run it in a thread
            # so the event loop stays free to accept new incoming requests
            await loop.run_in_executor(
                None,
                run_pipeline,
                job_id,
                job["file_id"],
                job["topic"],
                job["difficulty"],
                job["num_questions"],
            )
        except Exception as exc:
            logger.exception("❌ Pipeline failed job_id=%s: %s", job_id, exc)
            update_job_status(job_id, STATUS_FAILED)
        finally:
            _job_queue.task_done()


# ---------------------------------------------------------------------------
# App lifespan — start the worker on startup, cancel on shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    worker_task = asyncio.create_task(_queue_worker())
    yield
    worker_task.cancel()
    logger.info("🔴 Queue worker stopped")


app = FastAPI(lifespan=lifespan)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def health():
    return {"status": "ok", "queue_size": _job_queue.qsize()}


@app.post("/generate-questions", status_code=202)
async def generate_questions(request: GenerateJobRequest):
    """
    Enqueue the job and return 202 immediately.
    The single queue worker processes jobs one at a time — no pile-up.
    """
    await _job_queue.put({
        "job_id": request.jobId,
        "file_id": request.fileId,
        "topic": request.topic,
        "difficulty": request.difficultyLevel,
        "num_questions": request.numberOfQuestions,
    })
    logger.info("📥 Job enqueued job_id=%s (queue size: %d)", request.jobId, _job_queue.qsize())
    return {"message": "Job accepted", "jobId": request.jobId, "position": _job_queue.qsize()}


