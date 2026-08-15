from helpers.backoff import InfraBackoffTracker, infra_backoff_seconds, job_backoff_seconds


def test_infra_backoff_doubles_each_attempt():
    assert infra_backoff_seconds(1) == 1
    assert infra_backoff_seconds(2) == 2
    assert infra_backoff_seconds(3) == 4
    assert infra_backoff_seconds(4) == 8


def test_infra_backoff_caps_at_30_seconds():
    assert infra_backoff_seconds(10) == 30
    assert infra_backoff_seconds(100) == 30


def test_job_backoff_doubles_from_60_seconds_per_receive_count():
    # receive_count is ApproximateReceiveCount for the attempt that just failed
    assert job_backoff_seconds(1) == 60
    assert job_backoff_seconds(2) == 120
    assert job_backoff_seconds(3) == 240


def test_infra_backoff_tracker_grows_on_repeated_failures():
    tracker = InfraBackoffTracker()
    assert tracker.on_failure() == 1
    assert tracker.on_failure() == 2
    assert tracker.on_failure() == 4


def test_infra_backoff_tracker_resets_after_success():
    tracker = InfraBackoffTracker()
    tracker.on_failure()
    tracker.on_failure()
    tracker.on_success()
    assert tracker.on_failure() == 1
