from types import SimpleNamespace

import helpers.question_generator as qg


class FakeQuery:
    def __init__(self, log: list, table_name: str):
        self.log = log
        self.table_name = table_name

    def delete(self):
        self.log.append(("delete", self.table_name))
        return self

    def insert(self, rows):
        self.log.append(("insert", self.table_name, rows))
        return self

    def eq(self, column, value):
        self.log.append(("eq", column, value))
        return self

    def execute(self):
        last = self.log[-1]
        data = last[2] if last[0] == "insert" else []
        self.log.append(("execute",))
        return SimpleNamespace(data=data)


class FakeSupabase:
    def __init__(self):
        self.log: list = []

    def table(self, name):
        return FakeQuery(self.log, name)


def test_save_questions_deletes_existing_rows_for_job_before_inserting(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(qg, "supabase", fake)

    questions = [
        {
            "question_text": "What is 2+2?",
            "options": ["3", "4"],
            "correct_option": "4",
            "explanation": "basic math",
        }
    ]

    qg.save_questions_to_db(questions, job_id="job-1")

    # delete-by-job-id must happen, and must happen before the insert —
    # otherwise a redelivered SQS message re-running this pipeline duplicates rows.
    delete_index = fake.log.index(("delete", "ai-generated-questions"))
    eq_index = fake.log.index(("eq", "jobId", "job-1"))
    insert_index = next(i for i, entry in enumerate(fake.log) if entry[0] == "insert")

    assert delete_index < eq_index < insert_index


def test_save_questions_with_empty_list_does_not_touch_db():
    fake = FakeSupabase()

    import helpers.question_generator as qg2

    original = qg2.supabase
    qg2.supabase = fake
    try:
        result = qg2.save_questions_to_db([], job_id="job-1")
    finally:
        qg2.supabase = original

    assert result == []
    assert fake.log == []
