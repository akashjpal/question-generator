import logging
import threading

logger = logging.getLogger(__name__)


def start_heartbeat(sqs, queue_url: str, receipt_handle: str, interval_seconds: float, extension_seconds: int):
    """Periodically extend an in-flight message's visibility so a long-running
    job can't be redelivered mid-processing. Returns (stop_event, thread) —
    caller must call stop_event.set() and thread.join() when the job finishes."""
    stop_event = threading.Event()

    def _beat():
        while not stop_event.wait(interval_seconds):
            try:
                sqs.change_message_visibility(
                    QueueUrl=queue_url,
                    ReceiptHandle=receipt_handle,
                    VisibilityTimeout=extension_seconds,
                )
            except Exception:
                logger.exception("Heartbeat failed to extend visibility for %s", receipt_handle)

    thread = threading.Thread(target=_beat, daemon=True)
    thread.start()
    return stop_event, thread
