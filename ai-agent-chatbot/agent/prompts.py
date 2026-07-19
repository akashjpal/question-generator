"""
System prompt construction.

The knowledge doc is small and static, so it's embedded directly into the
system prompt on every turn rather than retrieved via RAG (confirmed
decision — revisit only if this grows into a real multi-document corpus).
"""
import functools
from pathlib import Path

_KNOWLEDGE_PATH = Path(__file__).resolve().parent.parent / "knowledge" / "ai-question-generator-basics.md"


@functools.lru_cache(maxsize=1)
def load_knowledge_doc() -> str:
    try:
        return _KNOWLEDGE_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        return "(knowledge doc not found — proceed using general judgment)"


_BASE_INSTRUCTIONS = """\
You are the AI Question Generator's in-app assistant, running in "Agentic \
Mode". A teacher is chatting with you to turn an uploaded PDF into a \
published, shareable quiz.

Required quiz details before generating: title, subject, difficulty \
(easy/medium/hard/expert), number of questions, and time limit (minutes). \
Topic is optional. Read the conversation so far to figure out what's already \
been said — don't ask about fields already known, and don't ask about the \
optional "topic" field unless the teacher seems to want to narrow focus.

Follow this loop:
1. If required quiz details are missing, ask a single, concise clarifying \
   question for the missing ones.
2. Once a PDF is attached and all required fields are known, call \
   generate_questions.
3. After generation completes, briefly summarize what was generated (topic, \
   difficulty, count) and confirm the teacher wants to publish before \
   calling publish_assessment. If they've already said "publish"/"go ahead" \
   proactively, you can skip the extra confirmation.
4. After publish_assessment succeeds, tell the teacher the quiz is live and \
   restate the attempt link and join code clearly — both are required for \
   students to join.
5. If the teacher wants to change a published quiz's title, subject, topic, \
   difficulty, description, or time limit, call update_assessment. This \
   cannot change individual question text/options/answers — say so if asked.
6. If a tool call fails, explain what went wrong in plain language and offer \
   to retry rather than silently failing.

Never fabricate a job id, file id, attempt link, or join code — only use \
values that came back from a tool call.
"""


def build_system_prompt(pending_file: dict | None, job_status: int | None, last_assessment_id: int | None) -> str:
    status_lines = [
        f"PDF attached: {'yes (' + pending_file['file_name'] + ')' if pending_file else 'no'}",
        f"Generation job status: {job_status if job_status is not None else 'not started'} "
        f"(0=Queued, 1=Processing, 2=Completed, 3=Failed)",
        f"Published assessment in this session: {last_assessment_id if last_assessment_id is not None else 'none yet'}",
    ]

    return (
        _BASE_INSTRUCTIONS
        + "\nCurrent session state:\n- "
        + "\n- ".join(status_lines)
        + "\n\n---\nReference knowledge (also shown to the teacher as help text):\n\n"
        + load_knowledge_doc()
    )
