import time

from helpers.heartbeat import start_heartbeat


class FakeSqs:
    def __init__(self):
        self.visibility_changes = []

    def change_message_visibility(self, QueueUrl, ReceiptHandle, VisibilityTimeout):
        self.visibility_changes.append((QueueUrl, ReceiptHandle, VisibilityTimeout))


def test_heartbeat_extends_visibility_periodically_until_stopped():
    sqs = FakeSqs()
    stop_event, thread = start_heartbeat(
        sqs=sqs,
        queue_url="q-url",
        receipt_handle="rh-1",
        interval_seconds=0.02,
        extension_seconds=900,
    )

    time.sleep(0.09)
    stop_event.set()
    thread.join(timeout=1)

    count_at_stop = len(sqs.visibility_changes)
    assert count_at_stop >= 2, "heartbeat should have fired more than once in 90ms at a 20ms interval"
    assert all(call == ("q-url", "rh-1", 900) for call in sqs.visibility_changes)

    # confirm it actually stopped — no further calls after joining
    time.sleep(0.06)
    assert len(sqs.visibility_changes) == count_at_stop


def test_heartbeat_survives_a_failed_extend_and_keeps_beating():
    sqs = FakeSqs()
    calls = {"n": 0}

    def flaky_change(QueueUrl, ReceiptHandle, VisibilityTimeout):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("transient ministack error")
        sqs.visibility_changes.append((QueueUrl, ReceiptHandle, VisibilityTimeout))

    sqs.change_message_visibility = flaky_change

    stop_event, thread = start_heartbeat(
        sqs=sqs,
        queue_url="q-url",
        receipt_handle="rh-1",
        interval_seconds=0.02,
        extension_seconds=900,
    )
    time.sleep(0.09)
    stop_event.set()
    thread.join(timeout=1)

    assert calls["n"] >= 2
    assert len(sqs.visibility_changes) >= 1
