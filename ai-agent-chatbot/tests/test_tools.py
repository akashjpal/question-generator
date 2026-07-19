import re
from unittest.mock import AsyncMock, patch

import pytest

from agent.request_context import set_current_token
from agent.tools.langchain_tools import generate_assessment_id, generate_join_code, update_assessment
from agent.tools.qgen_api_client import QGenApiClient, QGenApiError


def test_generate_join_code_shape():
    code = generate_join_code()
    assert len(code) == 6
    assert re.fullmatch(r"[A-Z0-9]{6}", code)


def test_generate_join_code_uses_full_alphabet_over_many_samples():
    codes = {generate_join_code() for _ in range(500)}
    assert len(codes) > 1  # not degenerate/constant


def test_generate_assessment_id_range():
    for _ in range(50):
        value = generate_assessment_id()
        assert 1 <= value <= 2**32 - 1


class _FakeResponse:
    def __init__(self, status_code=200, json_data=None, text=""):
        self.status_code = status_code
        self._json = json_data or {}
        self.text = text

    def json(self):
        return self._json


@pytest.mark.asyncio
async def test_check_generation_status_parses_int():
    client = QGenApiClient(bearer_token="fake-token", base_url="http://fake")
    fake_resp = _FakeResponse(json_data={"status": 2})

    with patch("httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.get = AsyncMock(return_value=fake_resp)
        status = await client.check_generation_status("job-1")

    assert status == 2


@pytest.mark.asyncio
async def test_start_generation_raises_on_error_status():
    client = QGenApiClient(bearer_token="fake-token", base_url="http://fake")
    fake_resp = _FakeResponse(status_code=500, text="boom")

    with patch("httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.post = AsyncMock(return_value=fake_resp)
        with pytest.raises(QGenApiError):
            await client.start_generation("f1", "f.pdf", "topic", "medium", 5)


@pytest.mark.asyncio
async def test_get_assessment_returns_none_on_400():
    client = QGenApiClient(bearer_token="fake-token", base_url="http://fake")
    fake_resp = _FakeResponse(status_code=400)

    with patch("httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.get = AsyncMock(return_value=fake_resp)
        result = await client.get_assessment(123)

    assert result is None


@pytest.mark.asyncio
async def test_check_join_code_available_true():
    client = QGenApiClient(bearer_token="fake-token", base_url="http://fake")
    fake_resp = _FakeResponse(json_data={"available": True})

    with patch("httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.get = AsyncMock(return_value=fake_resp)
        available = await client.check_join_code_available("ABC123")

    assert available is True


@pytest.mark.asyncio
async def test_update_assessment_client_posts_wrapped_body():
    client = QGenApiClient(bearer_token="fake-token", base_url="http://fake")
    fake_resp = _FakeResponse(status_code=200)

    with patch("httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.post = AsyncMock(return_value=fake_resp)
        await client.update_assessment({"id": 42, "title": "New Title"})

    instance.post.assert_awaited_once()
    _, kwargs = instance.post.call_args
    assert kwargs["json"] == {"assessment": {"id": 42, "title": "New Title"}}


CURRENT_ASSESSMENT = {
    "id": 42,
    "title": "Old Title",
    "subject": "Biology",
    "topic": "Cells",
    "difficulty": "medium",
    "description": "",
    "questions": [{"id": "q1", "question_text": "..."}],
    "questionsCount": 1,
    "status": 1,
    "code": "ABC123",
    "timeLimit": 15,
    "createdBy": "user-1",
}


def _tool_call(args: dict, call_id: str = "call_1") -> dict:
    """update_assessment has an InjectedToolCallId arg, so LangChain requires
    invocation via a full ToolCall dict rather than a plain args dict."""
    return {"name": "update_assessment", "args": args, "id": call_id, "type": "tool_call"}


@pytest.mark.asyncio
async def test_update_assessment_tool_overlays_only_changed_fields():
    set_current_token("fake-token")

    with patch("agent.tools.langchain_tools.get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.get_assessment = AsyncMock(return_value=dict(CURRENT_ASSESSMENT))
        mock_client.update_assessment = AsyncMock(return_value=None)
        mock_get_client.return_value = mock_client

        result = await update_assessment.ainvoke(_tool_call({
            "state": {"last_assessment_id": 42}, "title": "New Title", "time_limit": 30,
        }))

    sent_assessment = mock_client.update_assessment.call_args[0][0]
    assert sent_assessment["title"] == "New Title"
    assert sent_assessment["timeLimit"] == 30
    # untouched fields preserved verbatim
    assert sent_assessment["subject"] == "Biology"
    assert sent_assessment["questions"] == CURRENT_ASSESSMENT["questions"]
    assert sent_assessment["questionsCount"] == 1

    chat_log = result.update["chat_log"]
    assert chat_log[0]["tool_name"] == "update_assessment"
    assert chat_log[0]["tool_payload"] == {"title": "New Title", "timeLimit": 30}


@pytest.mark.asyncio
async def test_update_assessment_tool_requires_prior_publish():
    result = await update_assessment.ainvoke(_tool_call({"state": {}, "title": "X"}))
    assert "publish one first" in result.update["messages"][0].content
