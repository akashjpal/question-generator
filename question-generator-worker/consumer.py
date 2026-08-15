import logging
import os
import signal
import time

from dotenv import load_dotenv

from helpers.backoff import InfraBackoffTracker
from helpers.pipeline import run_pipeline, update_job_status
from helpers.receiver import handle_message
from helpers.sqs_client import get_queue_url, get_sqs_client

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

MAX_RECEIVE_COUNT = int(os.getenv("SQS_MAX_RECEIVE_COUNT", "3"))
WAIT_TIME_SECONDS = 20
MAX_NUMBER_OF_MESSAGES = 1

_shutdown = False


def _handle_signal(signum, _frame):
    global _shutdown
    logger.info("Received signal %s — will stop after the current message.", signum)
    _shutdown = True


def wait_for_queue(sqs, queue_url: str, poll_interval: int = 2) -> None:
    """Block until ministack genuinely answers, so startup ordering with the
    ministack-init provisioning sidecar doesn't race (mirrors that sidecar's
    own wait loop)."""
    while not _shutdown:
        try:
            sqs.get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn"])
            logger.info("Connected to SQS queue: %s", queue_url)
            return
        except Exception as exc:
            logger.warning("Waiting for SQS queue to become available: %s", exc)
            time.sleep(poll_interval)


def main():
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    sqs = get_sqs_client()
    queue_url = get_queue_url()
    infra_backoff = InfraBackoffTracker()

    wait_for_queue(sqs, queue_url)
    logger.info("🟢 Consumer started, polling %s (max_receive_count=%d)", queue_url, MAX_RECEIVE_COUNT)

    while not _shutdown:
        try:
            response = sqs.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=MAX_NUMBER_OF_MESSAGES,
                WaitTimeSeconds=WAIT_TIME_SECONDS,
                AttributeNames=["All"],
            )
            infra_backoff.on_success()
        except Exception:
            sleep_seconds = infra_backoff.on_failure()
            logger.exception("receive_message failed — backing off %ds before retrying", sleep_seconds)
            time.sleep(sleep_seconds)
            
            continue

        for message in response.get("Messages", []):
            handle_message(
                sqs=sqs,
                queue_url=queue_url,
                message=message,
                max_receive_count=MAX_RECEIVE_COUNT,
                run_pipeline=run_pipeline,
                update_job_status=update_job_status,
            )

    logger.info("🔴 Consumer stopped")


if __name__ == "__main__":
    main()

