import asyncio

import aioboto3
from botocore.config import Config

from src.config import Settings
from src.consumer.dispatcher import JobProcessingError, PoisonMessageError, dispatch
from src.services.container import Services
from src.utils.logging import get_logger

logger = get_logger()

_INFRA_BACKOFF_CAP_SECONDS = 30
_JOB_BACKOFF_BASE_SECONDS = 60


def _session_kwargs(settings: Settings) -> dict:
    return dict(
        endpoint_url=settings.aws_endpoint or None,
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        config=Config(retries={"max_attempts": 3, "mode": "standard"}),
    )


class SQSConsumer:
    """Async long-poll loop over the question-generator SQS queue. Bounded
    concurrency via a semaphore; each in-flight message gets its own
    visibility-heartbeat task so a multi-minute pipeline run isn't
    redelivered mid-processing. Deletes only on a clean graph completion —
    every failure path leaves the message for SQS's own redrive/DLQ."""

    def __init__(self, settings: Settings, services: Services, graph):
        self._settings = settings
        self._services = services
        self._graph = graph
        self._session = aioboto3.Session()
        self._semaphore = asyncio.Semaphore(settings.worker_concurrency)
        self._shutdown = asyncio.Event()
        self._inflight: set[asyncio.Task] = set()

    def request_shutdown(self) -> None:
        logger.info("shutdown requested — will stop polling and drain in-flight jobs")
        self._shutdown.set()

    async def run(self) -> None:
        async with self._session.client("sqs", **_session_kwargs(self._settings)) as sqs:
            await self._wait_for_queue(sqs)
            logger.info("consumer started", queue_url=self._settings.sqs_queue_url)
            infra_failures = 0

            while not self._shutdown.is_set():
                try:
                    response = await sqs.receive_message(
                        QueueUrl=self._settings.sqs_queue_url,
                        MaxNumberOfMessages=self._settings.sqs_max_messages,
                        WaitTimeSeconds=self._settings.sqs_wait_time,
                        AttributeNames=["ApproximateReceiveCount"],
                    )
                    infra_failures = 0
                except Exception:
                    infra_failures += 1
                    backoff = min(2 ** (infra_failures - 1), _INFRA_BACKOFF_CAP_SECONDS)
                    logger.exception("receive_message failed — backing off", backoff_seconds=backoff)
                    await asyncio.sleep(backoff)
                    continue

                for message in response.get("Messages", []):
                    await self._semaphore.acquire()
                    task = asyncio.create_task(self._handle_message(sqs, message))
                    self._inflight.add(task)
                    task.add_done_callback(self._on_task_done)

            logger.info("polling stopped — draining in-flight jobs", count=len(self._inflight))
            if self._inflight:
                await asyncio.wait(self._inflight, timeout=300)
            logger.info("consumer stopped")

    def _on_task_done(self, task: asyncio.Task) -> None:
        self._inflight.discard(task)
        self._semaphore.release()

    async def _wait_for_queue(self, sqs) -> None:
        """Block until the queue genuinely answers, so startup ordering with
        the ministack-init provisioning sidecar doesn't race."""
        while not self._shutdown.is_set():
            try:
                await sqs.get_queue_attributes(QueueUrl=self._settings.sqs_queue_url, AttributeNames=["QueueArn"])
                return
            except Exception as exc:
                logger.warning("waiting for SQS queue to become available", error=str(exc))
                await asyncio.sleep(2)

    async def _handle_message(self, sqs, message: dict) -> None:
        receipt_handle = message["ReceiptHandle"]
        receive_count = int(message.get("Attributes", {}).get("ApproximateReceiveCount", "1"))
        stop_heartbeat = asyncio.Event()
        heartbeat_task = asyncio.create_task(self._heartbeat(sqs, receipt_handle, stop_heartbeat))

        try:
            await dispatch(self._graph, message["Body"])
            await sqs.delete_message(QueueUrl=self._settings.sqs_queue_url, ReceiptHandle=receipt_handle)
            logger.info("message acked")
        except PoisonMessageError:
            logger.error("poison message, leaving on queue", body=message["Body"][:500])
        except JobProcessingError as exc:
            logger.exception("job processing failed", job_id=exc.job_id, receive_count=receive_count)
            if receive_count >= self._settings.sqs_max_receive_count:
                # Final attempt: mark terminal and leave the message for SQS's
                # own VisibilityTimeout to expire, at which point RedrivePolicy
                # moves it to the DLQ automatically.
                try:
                    await self._services.db.set_final_status(exc.job_id, "failed", error_reason=str(exc.cause))
                except Exception:
                    logger.exception("failed to write final failed status", job_id=exc.job_id)
            else:
                backoff = _JOB_BACKOFF_BASE_SECONDS * (2 ** (receive_count - 1))
                try:
                    await sqs.change_message_visibility(
                        QueueUrl=self._settings.sqs_queue_url,
                        ReceiptHandle=receipt_handle,
                        VisibilityTimeout=backoff,
                    )
                except Exception:
                    logger.exception("failed to extend visibility for backoff")
        finally:
            stop_heartbeat.set()
            await heartbeat_task

    async def _heartbeat(self, sqs, receipt_handle: str, stop_event: asyncio.Event) -> None:
        interval = self._settings.visibility_heartbeat_interval
        extension = self._settings.sqs_visibility_timeout
        while True:
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=interval)
                return
            except asyncio.TimeoutError:
                try:
                    await sqs.change_message_visibility(
                        QueueUrl=self._settings.sqs_queue_url,
                        ReceiptHandle=receipt_handle,
                        VisibilityTimeout=extension,
                    )
                except Exception:
                    logger.exception("heartbeat failed to extend visibility")
