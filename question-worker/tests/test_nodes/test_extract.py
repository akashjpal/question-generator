import pytest

from src.graph.errors import PermanentJobError
from src.graph.nodes.extract import make_extract_node
from tests.conftest import make_job, make_pdf_bytes, make_services


async def test_extract_normal_pdf_returns_text_and_initializes_loop_counters():
    services = make_services(settings=make_services().settings)
    node = make_extract_node(services)
    pdf = make_pdf_bytes("Photosynthesis converts light energy into chemical energy in plants.")

    result = await node({"job": make_job(noOfQuestion=2), "pdf_bytes": pdf})

    assert "Photosynthesis" in result["raw_text"]
    assert result["num_questions"] == 2
    assert result["needed"] == 2
    assert result["regeneration_round"] == 0
    assert result["warnings"] == []


async def test_extract_scanned_or_empty_pdf_is_permanent_error():
    services = make_services()
    node = make_extract_node(services)
    pdf = make_pdf_bytes("")  # no text -> under min_extracted_chars

    with pytest.raises(PermanentJobError):
        await node({"job": make_job(), "pdf_bytes": pdf})


async def test_extract_corrupt_pdf_is_permanent_error():
    services = make_services()
    node = make_extract_node(services)

    with pytest.raises(PermanentJobError):
        await node({"job": make_job(), "pdf_bytes": b"not a pdf at all"})


async def test_extract_clamps_num_questions_for_short_document():
    settings = make_services().settings
    services = make_services(settings=settings)
    node = make_extract_node(services)
    # min_chars_per_question=10 in test settings; noOfQuestion=5 needs 50 chars.
    short_text = "Short doc about cells. " * 2  # ~48 chars, still short of 50-ish but above min_extracted_chars=20
    pdf = make_pdf_bytes(short_text)

    result = await node({"job": make_job(noOfQuestion=5), "pdf_bytes": pdf})

    assert result["num_questions"] < 5
    assert any("clamped" in w for w in result["warnings"])
