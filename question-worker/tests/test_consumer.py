import asyncio

from src.consumer import sqs_consumer as sqs_consumer_module
from src.consumer.dispatcher import JobProcessingError, PoisonMessageError
from src.consumer.sqs_consumer import SQSConsumer
from tests.conftest import make_services, make_settings


class FakeSQSClient:
    def __init__(self, batches):
        self._batches = list(batches)
        self.deleted: list[str] = []
        self.visibility_changes: list[dict] = []

    async def get_queue_attributes(self, **kwargs):
        return {}

    async def receive_message(self, **kwargs):
        await asyncio.sleep(0)  # force a real cooperative yield, like real network I/O would
        if self._batches:
            return {"Messages": self._batches.pop(0)}
        return {"Messages": []}

    async def delete_message(self, **kwargs):
        self.deleted.append(kwargs["ReceiptHandle"])

    async def change_message_visibility(self, **kwargs):
        self.visibility_changes.append(kwargs)


class _AsyncCM:
    def __init__(self, obj):
        self._obj = obj

    async def __aenter__(self):
        return self._obj

    async def __aexit__(self, *args):
        return False


class FakeSession:
    def __init__(self, client):
        self._client = client

    def client(self, *args, **kwargs):
        return _AsyncCM(self._client)


def _message(body: str, receipt_handle: str = "rh-1", receive_count: str = "1") -> dict:
    return {
        "Body": body,
        "ReceiptHandle": receipt_handle,
        "Attributes": {"ApproximateReceiveCount": receive_count},
    }


async def _run_until(condition, run_task, timeout: float = 5.0) -> None:
    loop = asyncio.get_event_loop()
    deadline = loop.time() + timeout
    while not condition():
        assert loop.time() < deadline, "condition never became true"
        await asyncio.sleep(0.01)


async def test_successful_message_is_deleted(monkeypatch):
    async def fake_dispatch(graph, body):
        return None

    monkeypatch.setattr(sqs_consumer_module, "dispatch", fake_dispatch)

    settings = make_settings(sqs_wait_time=0, worker_concurrency=1)
    services = make_services(settings=settings)
    consumer = SQSConsumer(settings, services, graph=None)
    fake_client = FakeSQSClient([[_message('{"jobId":"j1"}')]])
    consumer._session = FakeSession(fake_client)

    run_task = asyncio.create_task(consumer.run())
    await _run_until(lambda: bool(fake_client.deleted), run_task)
    consumer.request_shutdown()
    await asyncio.wait_for(run_task, timeout=5)

    assert fake_client.deleted == ["rh-1"]


async def test_poison_message_is_left_on_queue(monkeypatch):
    async def fake_dispatch(graph, body):
        raise PoisonMessageError("bad body")

    monkeypatch.setattr(sqs_consumer_module, "dispatch", fake_dispatch)

    settings = make_settings(sqs_wait_time=0, worker_concurrency=1)
    services = make_services(settings=settings)
    consumer = SQSConsumer(settings, services, graph=None)
    fake_client = FakeSQSClient([[_message("not json")]])
    consumer._session = FakeSession(fake_client)

    run_task = asyncio.create_task(consumer.run())
    await asyncio.sleep(0.1)
    consumer.request_shutdown()
    await asyncio.wait_for(run_task, timeout=5)

    assert fake_client.deleted == []


async def test_transient_failure_below_max_receives_extends_visibility(monkeypatch):
    async def fake_dispatch(graph, body):
        raise JobProcessingError("job-1", RuntimeError("boom"))

    monkeypatch.setattr(sqs_consumer_module, "dispatch", fake_dispatch)

    settings = make_settings(sqs_wait_time=0, worker_concurrency=1, sqs_max_receive_count=3)
    services = make_services(settings=settings)
    consumer = SQSConsumer(settings, services, graph=None)
    fake_client = FakeSQSClient([[_message('{"jobId":"j1"}', receive_count="1")]])
    consumer._session = FakeSession(fake_client)

    run_task = asyncio.create_task(consumer.run())
    await _run_until(lambda: bool(fake_client.visibility_changes), run_task)
    consumer.request_shutdown()
    await asyncio.wait_for(run_task, timeout=5)

    assert fake_client.deleted == []
    assert len(fake_client.visibility_changes) >= 1
    assert services.db.final_status_calls == []


async def test_transient_failure_at_max_receives_marks_job_failed(monkeypatch):
    async def fake_dispatch(graph, body):
        raise JobProcessingError("job-1", RuntimeError("boom"))

    monkeypatch.setattr(sqs_consumer_module, "dispatch", fake_dispatch)

    settings = make_settings(sqs_wait_time=0, worker_concurrency=1, sqs_max_receive_count=3)
    services = make_services(settings=settings)
    consumer = SQSConsumer(settings, services, graph=None)
    fake_client = FakeSQSClient([[_message('{"jobId":"j1"}', receive_count="3")]])
    consumer._session = FakeSession(fake_client)

    run_task = asyncio.create_task(consumer.run())
    await _run_until(lambda: bool(services.db.final_status_calls), run_task)
    consumer.request_shutdown()
    await asyncio.wait_for(run_task, timeout=5)

    assert fake_client.deleted == []
    assert services.db.final_status_calls[-1]["status"] == "failed"


async def test_shutdown_drains_inflight_job_before_returning(monkeypatch):
    started = asyncio.Event()
    release = asyncio.Event()

    async def slow_dispatch(graph, body):
        started.set()
        await release.wait()

    monkeypatch.setattr(sqs_consumer_module, "dispatch", slow_dispatch)

    settings = make_settings(sqs_wait_time=0, worker_concurrency=1)
    services = make_services(settings=settings)
    consumer = SQSConsumer(settings, services, graph=None)
    fake_client = FakeSQSClient([[_message('{"jobId":"j1"}')]])
    consumer._session = FakeSession(fake_client)

    run_task = asyncio.create_task(consumer.run())
    await asyncio.wait_for(started.wait(), timeout=5)
    consumer.request_shutdown()
    await asyncio.sleep(0.05)
    assert not run_task.done()  # still draining the in-flight job, hasn't returned yet

    release.set()
    await asyncio.wait_for(run_task, timeout=5)
    assert run_task.done()
