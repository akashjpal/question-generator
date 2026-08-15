from src.graph.nodes.persist import make_persist_node
from src.models.outputs import GeneratedQuestion
from tests.conftest import FakeDB, make_job, make_services


def _q(text: str) -> GeneratedQuestion:
    return GeneratedQuestion(
        question_text=text, options=["a", "b", "c", "d"], correct_option="A", explanation="x"
    )


async def test_persist_writes_completed_status_when_full_target_met():
    db = FakeDB()
    services = make_services(db=db)
    node = make_persist_node(services)

    await node(
        {
            "job": make_job(noOfQuestion=2),
            "num_questions": 2,
            "accepted": [_q("q1"), _q("q2")],
            "rejected": [],
            "regeneration_round": 1,
        }
    )

    assert db.final_status_calls[-1]["status"] == "completed"
    assert len(db.legacy_saved[-1][1]) == 2


async def test_persist_writes_completed_partial_on_shortfall():
    db = FakeDB()
    services = make_services(db=db)
    node = make_persist_node(services)

    await node(
        {
            "job": make_job(noOfQuestion=5),
            "num_questions": 5,
            "accepted": [_q("q1")],
            "rejected": [],
            "regeneration_round": 2,
        }
    )

    assert db.final_status_calls[-1]["status"] == "completed_partial"
    assert any("Only 1/5" in w for w in db.final_status_calls[-1]["progress_meta"]["warnings"])


async def test_persist_writes_failed_status_on_error_without_saving_questions():
    db = FakeDB()
    services = make_services(db=db)
    node = make_persist_node(services)

    await node({"job": make_job(), "error": "PDF appears scanned or empty"})

    assert db.final_status_calls[-1]["status"] == "failed"
    assert db.final_status_calls[-1]["error_reason"] == "PDF appears scanned or empty"
    assert db.legacy_saved == []


async def test_persist_truncates_accepted_to_requested_count():
    db = FakeDB()
    services = make_services(db=db)
    node = make_persist_node(services)

    await node(
        {
            "job": make_job(noOfQuestion=1),
            "num_questions": 1,
            "accepted": [_q("q1"), _q("q2"), _q("q3")],  # overshoot from generator
            "rejected": [],
            "regeneration_round": 0,
        }
    )

    assert len(db.legacy_saved[-1][1]) == 1
    assert db.final_status_calls[-1]["status"] == "completed"
