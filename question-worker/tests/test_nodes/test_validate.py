from datetime import datetime, timedelta, timezone

from src.graph.errors import TransientJobError
from src.graph.nodes.validate import make_validate_node
from tests.conftest import FakeDB, make_job, make_services, make_settings


async def test_new_job_proceeds_and_bumps_attempt_count():
    db = FakeDB(initial_row={"job_id": "job-1", "status": "queued", "attempt_count": 0, "updated_at": None})
    services = make_services(db=db)
    node = make_validate_node(services)

    result = await node({"job": make_job()})

    assert result == {"skip_reason": None, "warnings": []}
    assert db._row["attempt_count"] == 1
    assert db._row["status"] == "in_progress"


async def test_already_completed_job_is_skipped():
    db = FakeDB(initial_row={"job_id": "job-1", "status": "completed", "attempt_count": 1, "updated_at": None})
    services = make_services(db=db)
    node = make_validate_node(services)

    result = await node({"job": make_job()})

    assert result["skip_reason"] == "job already completed"


async def test_recently_updated_in_progress_row_is_treated_as_owned_elsewhere():
    now = datetime.now(timezone.utc).isoformat()
    db = FakeDB(initial_row={"job_id": "job-1", "status": "in_progress", "attempt_count": 1, "updated_at": now})
    services = make_services(db=db, settings=make_services().settings)
    node = make_validate_node(services)

    try:
        await node({"job": make_job()})
        assert False, "expected TransientJobError"
    except TransientJobError:
        pass


async def test_stale_in_progress_row_is_retried():
    stale = datetime(2000, 1, 1, tzinfo=timezone.utc).isoformat()
    db = FakeDB(initial_row={"job_id": "job-1", "status": "in_progress", "attempt_count": 1, "updated_at": stale})
    services = make_services(db=db)
    node = make_validate_node(services)

    result = await node({"job": make_job()})

    assert result["skip_reason"] is None
    assert db._row["attempt_count"] == 2


async def test_stale_after_derives_from_visibility_timeout_not_heartbeat_interval():
    """Regression test for RCA_Bug_StaleAfterExceedsVisibilityTimeout.md: with
    default settings (sqs_visibility_timeout=120), stale_after must land
    below 120s (currently 100s = 120 - 20 margin), not above it like the old
    heartbeat_interval*3=180s derivation did."""
    settings = make_settings()
    assert settings.sqs_visibility_timeout == 120

    fresh_at = (datetime.now(timezone.utc) - timedelta(seconds=90)).isoformat()
    db = FakeDB(initial_row={"job_id": "job-1", "status": "in_progress", "attempt_count": 1, "updated_at": fresh_at})
    node = make_validate_node(make_services(db=db, settings=settings))
    try:
        await node({"job": make_job()})
        assert False, "expected TransientJobError — 90s old is still within the 100s stale_after"
    except TransientJobError:
        pass

    stale_at = (datetime.now(timezone.utc) - timedelta(seconds=110)).isoformat()
    db = FakeDB(initial_row={"job_id": "job-1", "status": "in_progress", "attempt_count": 1, "updated_at": stale_at})
    node = make_validate_node(make_services(db=db, settings=settings))
    result = await node({"job": make_job()})
    assert result["skip_reason"] is None


async def test_stale_after_tracks_a_custom_visibility_timeout():
    """A row that's fresh under a longer visibility_timeout's derived
    stale_after must still defer, proving stale_after scales with
    sqs_visibility_timeout rather than being a fixed constant."""
    settings = make_settings(sqs_visibility_timeout=200)  # stale_after = 200 - 20 = 180

    fresh_at = (datetime.now(timezone.utc) - timedelta(seconds=150)).isoformat()
    db = FakeDB(initial_row={"job_id": "job-1", "status": "in_progress", "attempt_count": 1, "updated_at": fresh_at})
    node = make_validate_node(make_services(db=db, settings=settings))
    try:
        await node({"job": make_job()})
        assert False, "expected TransientJobError — 150s old is within the 180s stale_after here"
    except TransientJobError:
        pass


async def test_stale_after_floor_prevents_a_tiny_visibility_timeout_from_zeroing_it_out():
    """A very small sqs_visibility_timeout (e.g. 50s) minus the 20s margin
    would be 30s — the floor keeps stale_after from going any lower/negative
    for pathological configs."""
    settings = make_settings(sqs_visibility_timeout=50)  # 50 - 20 = 30, equals the floor

    stale_at = (datetime.now(timezone.utc) - timedelta(seconds=40)).isoformat()
    db = FakeDB(initial_row={"job_id": "job-1", "status": "in_progress", "attempt_count": 1, "updated_at": stale_at})
    node = make_validate_node(make_services(db=db, settings=settings))
    result = await node({"job": make_job()})
    assert result["skip_reason"] is None
