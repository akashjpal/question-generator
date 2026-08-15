import json

from src.graph.build import build_graph, run_job
from tests.conftest import FakeDB, ScriptedLLM, make_job, make_pdf_bytes, make_services

_LONG_TEXT = "Cells are the basic structural unit of all living organisms. " * 80


def _candidate_json(text: str, chunk_id: int = 0) -> dict:
    return {
        "question_text": text,
        "options": ["A opt", "B opt", "C opt", "D opt"],
        "correct_option": "A",
        "explanation": "explained",
        "source_chunk_ids": [chunk_id],
    }


def _verdict(index: int, accept: bool, reason: str) -> dict:
    return {
        "question_index": index,
        "difficulty_match": True,
        "topic_relevant": True,
        "grounded_in_source": True,
        "accept": accept,
        "reason": reason,
    }


async def test_full_accept_in_first_round_persists_completed():
    generator = ScriptedLLM([json.dumps([_candidate_json("q1"), _candidate_json("q2")])])
    judge = ScriptedLLM([json.dumps({"verdicts": [_verdict(0, True, "ok"), _verdict(1, True, "ok")]})])
    db = FakeDB()
    services = make_services(db=db, generator_llm=generator, judge_llm=judge)
    services.storage._pdf_bytes = make_pdf_bytes(_LONG_TEXT)

    graph = build_graph(services)
    job = make_job(noOfQuestion=2, topic=None)
    await run_job(graph, job)

    assert db.final_status_calls[-1]["status"] == "completed"
    assert len(db.legacy_saved[-1][1]) == 2


async def test_partial_acceptance_triggers_one_regeneration_round():
    generator = ScriptedLLM(
        [
            json.dumps([_candidate_json("q1"), _candidate_json("q2")]),
            json.dumps([_candidate_json("q3")]),
        ]
    )
    judge = ScriptedLLM(
        [
            json.dumps({"verdicts": [_verdict(0, True, "ok"), _verdict(1, False, "bad")]}),
            json.dumps({"verdicts": [_verdict(0, True, "ok")]}),
        ]
    )
    db = FakeDB()
    services = make_services(db=db, generator_llm=generator, judge_llm=judge)
    services.storage._pdf_bytes = make_pdf_bytes(_LONG_TEXT)

    graph = build_graph(services)
    job = make_job(noOfQuestion=2, topic=None)
    result = await run_job(graph, job)

    assert result["regeneration_round"] == 2
    assert db.final_status_calls[-1]["status"] == "completed"
    assert len(db.legacy_saved[-1][1]) == 2


async def test_rounds_exhausted_persists_completed_partial():
    generator = ScriptedLLM([json.dumps([_candidate_json("q1")]), json.dumps([_candidate_json("q2")])])
    judge = ScriptedLLM(
        [
            json.dumps({"verdicts": [_verdict(0, False, "bad")]}),
            json.dumps({"verdicts": [_verdict(0, False, "bad")]}),
        ]
    )
    db = FakeDB()
    settings = make_services().settings  # max_regeneration_rounds=2
    services = make_services(db=db, settings=settings, generator_llm=generator, judge_llm=judge)
    services.storage._pdf_bytes = make_pdf_bytes(_LONG_TEXT)

    graph = build_graph(services)
    job = make_job(noOfQuestion=3, topic=None)
    await run_job(graph, job)

    assert db.final_status_calls[-1]["status"] == "completed_partial"
    assert db.legacy_saved[-1][1] == []


async def test_permanent_error_short_circuits_to_persist_failed():
    db = FakeDB()
    services = make_services(db=db)
    services.storage._pdf_bytes = make_pdf_bytes("")  # too short -> PermanentJobError in extract

    graph = build_graph(services)
    job = make_job(noOfQuestion=2, topic=None)
    result = await run_job(graph, job)

    assert db.final_status_calls[-1]["status"] == "failed"
    assert "error" in result and result["error"]


async def test_already_completed_job_skips_pipeline_entirely():
    db = FakeDB(initial_row={"job_id": "job-1", "status": "completed", "attempt_count": 1, "updated_at": None})
    services = make_services(db=db)

    graph = build_graph(services)
    job = make_job()
    result = await run_job(graph, job)

    assert result.get("skip_reason") == "job already completed"
    # No pipeline work happened, no new persist write.
    assert db.final_status_calls == []
