import pytest

from src.consumer.dispatcher import JobProcessingError, PoisonMessageError, dispatch, parse_job_payload


def test_parse_job_payload_valid():
    payload = parse_job_payload('{"jobId":"j1","fileId":"f1","noOfQuestion":5,"difficulty":"Hard"}')
    assert payload.job_id == "j1"
    assert payload.difficulty == "hard"


def test_parse_job_payload_invalid_json_raises_poison():
    with pytest.raises(PoisonMessageError):
        parse_job_payload("not json")


def test_parse_job_payload_missing_required_field_raises_poison():
    with pytest.raises(PoisonMessageError):
        parse_job_payload('{"fileId":"f1"}')  # missing jobId


async def test_dispatch_wraps_graph_failure_in_job_processing_error():
    class ExplodingGraph:
        async def ainvoke(self, state):
            raise RuntimeError("boom")

    with pytest.raises(JobProcessingError) as exc_info:
        await dispatch(ExplodingGraph(), '{"jobId":"j1","fileId":"f1"}')

    assert exc_info.value.job_id == "j1"


async def test_dispatch_succeeds_when_graph_completes():
    class OkGraph:
        async def ainvoke(self, state):
            return {"skip_reason": None}

    await dispatch(OkGraph(), '{"jobId":"j1","fileId":"f1"}')  # no exception raised
