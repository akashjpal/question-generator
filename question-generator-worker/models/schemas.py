from typing import Literal
from pydantic import BaseModel


class GenerateQuestionsRequest(BaseModel):
    file_path: str
    topic: str
    difficulty: Literal["easy", "medium", "hard", "expert"]
    num_questions: int = 10
    job_id: str | None = None


class MCQuestion(BaseModel):
    question_text: str
    options: list[str]
    correct_option: str
    explanation: str


class GenerateQuestionsResponse(BaseModel):
    job_id: str | None
    file_path: str
    page_count: int
    questions: list[MCQuestion]
    total_generated: int
