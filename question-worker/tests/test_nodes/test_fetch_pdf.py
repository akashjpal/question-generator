import pytest

from src.graph.errors import PermanentJobError
from src.graph.nodes.fetch_pdf import make_fetch_pdf_node
from tests.conftest import FakeDB, FakeStorage, make_job, make_services


async def test_fetch_pdf_downloads_by_file_id():
    storage = FakeStorage(pdf_bytes=b"%PDF-fake")
    services = make_services(storage=storage, db=FakeDB())
    node = make_fetch_pdf_node(services)

    result = await node({"job": make_job(fileId="the-file-key")})

    assert result == {"pdf_bytes": b"%PDF-fake"}
    assert storage.requested_keys == ["the-file-key"]


async def test_fetch_pdf_propagates_permanent_error_for_missing_file():
    storage = FakeStorage(error=PermanentJobError("File not found in storage: x", stage="fetch_pdf"))
    services = make_services(storage=storage)
    node = make_fetch_pdf_node(services)

    with pytest.raises(PermanentJobError):
        await node({"job": make_job()})
