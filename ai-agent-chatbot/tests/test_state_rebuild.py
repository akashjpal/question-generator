from langchain_core.messages import AIMessage, HumanMessage

from agent.state import (
    build_state_from_rows,
    extract_job_fields,
    extract_questions,
    messages_from_rows,
)


def _row(role, content, tool_name=None, tool_payload=None):
    return {"role": role, "content": content, "tool_name": tool_name, "tool_payload": tool_payload}


def test_messages_from_rows_maps_user_and_assistant():
    rows = [_row("user", "hi"), _row("assistant", "hello")]
    messages = messages_from_rows(rows)
    assert messages == [HumanMessage(content="hi"), AIMessage(content="hello")]


def test_messages_from_rows_prefixes_tool_rows_and_never_emits_tool_message():
    rows = [_row("tool", "Started generating 10 questions.", tool_name="generate_questions")]
    messages = messages_from_rows(rows)
    assert len(messages) == 1
    assert isinstance(messages[0], AIMessage)
    assert messages[0].content == "[generate_questions] Started generating 10 questions."


def test_extract_job_fields_returns_most_recent():
    rows = [
        _row("tool", "started", "generate_questions", {"job_id": "job-1", "job_status": 0}),
        _row("assistant", "some other reply"),
        _row("tool", "still going", "generate_questions", {"job_id": "job-1", "job_status": 1}),
    ]
    job_id, job_status = extract_job_fields(rows)
    assert job_id == "job-1"
    assert job_status == 1


def test_extract_job_fields_none_when_no_generation_started():
    assert extract_job_fields([_row("user", "hi")]) == (None, None)


def test_extract_questions_finds_completion_row_not_started_row():
    rows = [
        _row("tool", "started", "generate_questions", {"job_id": "job-1", "job_status": 0}),
        _row("tool", "fetched", "generate_questions", {"job_id": "job-1", "job_status": 2, "questions": [{"id": "q1"}]}),
    ]
    questions = extract_questions(rows)
    assert questions == [{"id": "q1"}]


def test_extract_questions_none_when_not_yet_fetched():
    rows = [_row("tool", "started", "generate_questions", {"job_id": "job-1", "job_status": 0})]
    assert extract_questions(rows) is None


def test_build_state_from_rows_composes_everything():
    session_row = {
        "id": "session-1",
        "pending_file_id": "file-1",
        "pending_file_name": "notes.pdf",
        "last_assessment_id": 42,
    }
    rows = [
        _row("user", "make a quiz"),
        _row("tool", "started", "generate_questions", {"job_id": "job-1", "job_status": 0}),
        _row("tool", "fetched", "generate_questions", {"job_id": "job-1", "job_status": 2, "questions": [{"id": "q1"}]}),
    ]
    state = build_state_from_rows(session_row, "user-1", rows)

    assert state["session_id"] == "session-1"
    assert state["user_id"] == "user-1"
    assert state["pending_file"] == {"file_id": "file-1", "file_name": "notes.pdf"}
    assert state["job_id"] == "job-1"
    assert state["job_status"] == 2
    assert state["questions"] == [{"id": "q1"}]
    assert state["last_assessment_id"] == 42
    assert state["published"] is None
    assert state["chat_log"] == []
    assert len(state["messages"]) == 3


def test_build_state_from_rows_no_pending_file():
    session_row = {"id": "session-1", "pending_file_id": None, "pending_file_name": None, "last_assessment_id": None}
    state = build_state_from_rows(session_row, "user-1", [])
    assert state["pending_file"] is None
    assert state["last_assessment_id"] is None
