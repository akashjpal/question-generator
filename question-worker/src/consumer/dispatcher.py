import json

from pydantic import ValidationError

from src.graph.build import run_job
from src.models.job import JobPayload
from src.utils.logging import bind_job_id, clear_job_context, get_logger

logger = get_logger()


class PoisonMessageError(Exception):
    """Body isn't parseable JSON or doesn't satisfy JobPayload's schema.
    Left on the queue (never deleted/acked) — same policy as every other
    unretriable failure: SQS's own redrive + DLQ handles it, retrying
    can't fix a malformed message."""


class JobProcessingError(Exception):
    """Wraps whatever the graph raised (almost always TransientJobError,
    since PermanentJobError is caught inside the graph and routed to
    `persist`). Carries job_id so the consumer can decide final-attempt
    handling without re-parsing the message body."""

    def __init__(self, job_id: str, cause: Exception):
        super().__init__(str(cause))
        self.job_id = job_id
        self.cause = cause


def parse_job_payload(body: str) -> JobPayload:
    try:
        raw = json.loads(body)
    except (json.JSONDecodeError, TypeError) as exc:
        raise PoisonMessageError(f"Body is not valid JSON: {exc}") from exc
    try:
        return JobPayload.model_validate(raw)
    except ValidationError as exc:
        raise PoisonMessageError(f"Body failed JobPayload validation: {exc}") from exc


async def dispatch(graph, message_body: str) -> None:
    """Raises PoisonMessageError or JobProcessingError to signal the caller
    should NOT ack the message. Returns normally on every terminal outcome
    the graph itself already recorded to the DB (completed, completed_partial,
    or a handled PermanentJobError persisted as failed) — all of those are a
    clean ack."""
    job = parse_job_payload(message_body)
    bind_job_id(job.job_id)
    try:
        logger.info(
            "job started",
            file_id=job.file_id,
            num_questions=job.num_questions,
            difficulty=job.difficulty,
            topic=job.topic,
        )
        await run_job(graph, job)
        logger.info("job graph completed")
    except Exception as exc:
        raise JobProcessingError(job.job_id, exc) from exc
    finally:
        clear_job_context()
