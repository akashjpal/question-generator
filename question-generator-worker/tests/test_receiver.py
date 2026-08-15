import json
import time

from helpers.receiver import STATUS_FAILED, handle_message, parse_job

MAX_RECEIVE_COUNT = 3


class FakeSqs:
    def __init__(self):
        self.deleted = []
        self.visibility_changes = []

    def delete_message(self, QueueUrl, ReceiptHandle):
        self.deleted.append(ReceiptHandle)

    def change_message_visibility(self, QueueUrl, ReceiptHandle, VisibilityTimeout):
        self.visibility_changes.append((ReceiptHandle, VisibilityTimeout))


def make_message(body: dict, receive_count: int, receipt_handle: str = "rh-1") -> dict:
    return {
        "ReceiptHandle": receipt_handle,
        "Body": json.dumps(body),
        "Attributes": {"ApproximateReceiveCount": str(receive_count)},
    }


VALID_JOB = {
    "jobId": "job-1",
    "fileId": "file-1",
    "topic": "Photosynthesis",
    "difficultyLevel": "medium",
    "numberOfQuestions": 10,
}


def test_parse_job_accepts_valid_body():
    job = parse_job(json.dumps(VALID_JOB))
    assert job == VALID_JOB


def test_parse_job_rejects_invalid_json():
    assert parse_job("not json") is None


def test_parse_job_rejects_missing_required_keys():
    assert parse_job(json.dumps({"topic": "no jobId or fileId"})) is None


def test_handle_message_success_deletes_and_does_not_touch_visibility_or_status():
    sqs = FakeSqs()
    calls = {"pipeline": [], "status": []}
    handle_message(
        sqs=sqs,
        queue_url="q-url",
        message=make_message(VALID_JOB, receive_count=1),
        max_receive_count=MAX_RECEIVE_COUNT,
        run_pipeline=lambda **kw: calls["pipeline"].append(kw),
        update_job_status=lambda job_id, status: calls["status"].append((job_id, status)),
    )
    assert sqs.deleted == ["rh-1"]
    assert sqs.visibility_changes == []
    assert calls["status"] == []
    assert calls["pipeline"] == [
        {
            "job_id": "job-1",
            "file_id": "file-1",
            "topic": "Photosynthesis",
            "difficulty": "medium",
            "num_questions": 10,
        }
    ]


def test_handle_message_poison_message_is_never_deleted():
    sqs = FakeSqs()
    calls = {"pipeline": [], "status": []}
    handle_message(
        sqs=sqs,
        queue_url="q-url",
        message=make_message({"topic": "missing required keys"}, receive_count=1),
        max_receive_count=MAX_RECEIVE_COUNT,
        run_pipeline=lambda **kw: calls["pipeline"].append(kw),
        update_job_status=lambda job_id, status: calls["status"].append((job_id, status)),
    )
    assert sqs.deleted == []
    assert sqs.visibility_changes == []
    assert calls["pipeline"] == []
    assert calls["status"] == []


def test_handle_message_failure_below_max_extends_visibility_and_does_not_delete():
    sqs = FakeSqs()

    def failing_pipeline(**kw):
        raise RuntimeError("groq blew up")

    calls = {"status": []}
    handle_message(
        sqs=sqs,
        queue_url="q-url",
        message=make_message(VALID_JOB, receive_count=1),
        max_receive_count=MAX_RECEIVE_COUNT,
        run_pipeline=failing_pipeline,
        update_job_status=lambda job_id, status: calls["status"].append((job_id, status)),
    )
    assert sqs.deleted == []
    assert sqs.visibility_changes == [("rh-1", 60)]
    assert calls["status"] == []


def test_handle_message_heartbeats_during_a_slow_pipeline_and_stops_after():
    sqs = FakeSqs()

    def slow_pipeline(**kw):
        time.sleep(0.09)

    handle_message(
        sqs=sqs,
        queue_url="q-url",
        message=make_message(VALID_JOB, receive_count=1),
        max_receive_count=MAX_RECEIVE_COUNT,
        run_pipeline=slow_pipeline,
        update_job_status=lambda job_id, status: None,
        heartbeat_interval_seconds=0.02,
        heartbeat_extension_seconds=900,
    )

    # heartbeat fired at least twice during the 90ms job at a 20ms interval,
    # extending visibility so SQS can't redeliver mid-job
    assert len(sqs.visibility_changes) >= 2
    assert all(call == ("rh-1", 900) for call in sqs.visibility_changes)

    count_at_finish = len(sqs.visibility_changes)
    time.sleep(0.06)
    assert len(sqs.visibility_changes) == count_at_finish, "heartbeat must stop once the job finishes"

    # the job succeeded, so it should still delete normally
    assert sqs.deleted == ["rh-1"]


def test_handle_message_failure_at_max_marks_failed_and_does_not_delete():
    sqs = FakeSqs()

    def failing_pipeline(**kw):
        raise RuntimeError("groq blew up")

    calls = {"status": []}
    handle_message(
        sqs=sqs,
        queue_url="q-url",
        message=make_message(VALID_JOB, receive_count=MAX_RECEIVE_COUNT),
        max_receive_count=MAX_RECEIVE_COUNT,
        run_pipeline=failing_pipeline,
        update_job_status=lambda job_id, status: calls["status"].append((job_id, status)),
    )
    assert sqs.deleted == []
    assert sqs.visibility_changes == []
    assert calls["status"] == [("job-1", STATUS_FAILED)]
