import json
import logging

from helpers.backoff import job_backoff_seconds
from helpers.heartbeat import start_heartbeat as _start_heartbeat

logger = logging.getLogger(__name__)

STATUS_FAILED = 3

_REQUIRED_JOB_KEYS = ("jobId", "fileId")

HEARTBEAT_INTERVAL_SECONDS = 60
HEARTBEAT_EXTENSION_SECONDS = 900


def parse_job(body: str) -> dict | None:
    """Parse an SQS message body into a job dict, or None if it's a poison message."""
    try:
        job = json.loads(body)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(job, dict) or not all(k in job for k in _REQUIRED_JOB_KEYS):
        return None
    return job


def handle_message(
    sqs,
    queue_url: str,
    message: dict,
    max_receive_count: int,
    run_pipeline,
    update_job_status,
    start_heartbeat=_start_heartbeat,
    heartbeat_interval_seconds: float = HEARTBEAT_INTERVAL_SECONDS,
    heartbeat_extension_seconds: int = HEARTBEAT_EXTENSION_SECONDS,
) -> None:
    """Process one SQS message. Deletes only on success — every failure path
    (poison body, pipeline exception) leaves the message on the queue so SQS's
    own redelivery + RedrivePolicy handles retry and eventual DLQ routing."""
    receipt_handle = message["ReceiptHandle"]
    receive_count = int(message["Attributes"]["ApproximateReceiveCount"])

    job = parse_job(message["Body"])
    if job is None:
        logger.error("Poison message (unparseable/missing required keys), leaving on queue: %s", message["Body"])
        return

    job_id = job["jobId"]
    stop_heartbeat, heartbeat_thread = start_heartbeat(
        sqs=sqs,
        queue_url=queue_url,
        receipt_handle=receipt_handle,
        interval_seconds=heartbeat_interval_seconds,
        extension_seconds=heartbeat_extension_seconds,
    )
    try:
        run_pipeline(
            job_id=job_id,
            file_id=job["fileId"],
            topic=job.get("topic"),
            difficulty=job.get("difficulty", "medium"),
            num_questions=job.get("noOfQuestion", 10),
        )
        sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt_handle)
    except Exception:
        logger.exception("Pipeline failed job_id=%s (receive_count=%d)", job_id, receive_count)
        if receive_count >= max_receive_count:
            # Final attempt: mark terminal and leave the message for SQS's own
            # VisibilityTimeout to expire, at which point RedrivePolicy moves
            # it to the DLQ automatically.
            update_job_status(job_id, STATUS_FAILED)
        else:
            sqs.change_message_visibility(
                QueueUrl=queue_url,
                ReceiptHandle=receipt_handle,
                VisibilityTimeout=job_backoff_seconds(receive_count),
            )
    finally:
        stop_heartbeat.set()
        heartbeat_thread.join(timeout=5)
