import sys
from pathlib import Path
from types import SimpleNamespace

import fitz  # PyMuPDF
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config import Settings  # noqa: E402
from src.models.job import JobPayload  # noqa: E402
from src.services.container import Services  # noqa: E402


def make_pdf_bytes(text: str, pages: int = 1) -> bytes:
    doc = fitz.open()
    for _ in range(pages):
        page = doc.new_page()
        page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


def make_job(**overrides) -> JobPayload:
    data = {
        "jobId": "job-1",
        "fileId": "file-1",
        "noOfQuestion": 3,
        "difficulty": "medium",
        "topic": "Photosynthesis",
    }
    data.update(overrides)
    return JobPayload.model_validate(data)


def make_settings(**overrides) -> Settings:
    data = dict(
        supabase_url="https://x.supabase.co",
        supabase_service_role_key="key",
        openrouter_api_key="key",
        sqs_queue_url="http://localhost:4566/000000000000/q",
        min_extracted_chars=20,
        min_chars_per_question=10,
        duplicate_similarity_threshold=0.90,
        max_regeneration_rounds=2,
    )
    data.update(overrides)
    return Settings(**data)


class ScriptedLLM:
    """Fake chat model: `.ainvoke(prompt)` pops the next scripted response.
    Mirrors the FakeLLM pattern already used in qgen_graph's own tests
    (`.invoke(prompt) -> SimpleNamespace(content=...)`), just async."""

    def __init__(self, responses: list[str]):
        self._responses = list(responses)
        self.prompts: list[str] = []

    async def ainvoke(self, prompt: str):
        self.prompts.append(prompt)
        if not self._responses:
            raise RuntimeError("ScriptedLLM ran out of scripted responses")
        return SimpleNamespace(content=self._responses.pop(0))


class FakeEmbeddingsService:
    """Deterministic fake: explicit text->vector overrides for texts a test
    cares about; any other text gets its own orthogonal one-hot vector so
    cosine similarity between unlisted texts is always 0 (never accidentally
    "duplicate")."""

    def __init__(self, vectors: dict[str, list[float]] | None = None, dim: int = 8):
        self._vectors = dict(vectors or {})
        self._dim = dim
        self._next_slot = 0
        self.calls: list[list[str]] = []

    async def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        result = []
        for text in texts:
            if text not in self._vectors:
                vec = [0.0] * self._dim
                vec[self._next_slot % self._dim] = 1.0
                self._next_slot += 1
                self._vectors[text] = vec
            result.append(self._vectors[text])
        return result


class FakeStorage:
    def __init__(self, pdf_bytes: bytes | None = None, error: Exception | None = None):
        self._pdf_bytes = pdf_bytes
        self._error = error
        self.requested_keys: list[str] = []

    async def download_pdf(self, key: str) -> bytes:
        self.requested_keys.append(key)
        if self._error:
            raise self._error
        return self._pdf_bytes


class FakeDB:
    def __init__(self, initial_row: dict | None = None):
        self.stage_calls: list[tuple[str, str]] = []
        self.final_status_calls: list[dict] = []
        self.rejected_calls: list[tuple[str, list]] = []
        self.legacy_saved: list[tuple[str, list]] = []
        self._row = initial_row or {
            "job_id": "job-1",
            "status": "queued",
            "attempt_count": 0,
            "updated_at": None,
        }

    async def set_stage(self, job_id: str, stage: str) -> None:
        self.stage_calls.append((job_id, stage))

    async def get_job(self, job_id: str) -> dict | None:
        return dict(self._row)

    async def ensure_job_row(self, job_id: str) -> dict:
        return dict(self._row)

    async def increment_attempt(self, job_id: str, attempt_count: int) -> None:
        self._row["attempt_count"] = attempt_count
        self._row["status"] = "in_progress"

    async def set_final_status(self, job_id, status, *, error_reason=None, progress_meta=None) -> None:
        self._row["status"] = status
        self.final_status_calls.append(
            {"job_id": job_id, "status": status, "error_reason": error_reason, "progress_meta": progress_meta}
        )

    async def insert_rejected(self, job_id: str, rejected: list) -> None:
        self.rejected_calls.append((job_id, list(rejected)))

    async def legacy_save_questions(self, job_id: str, questions: list) -> None:
        self.legacy_saved.append((job_id, list(questions)))


def make_services(
    *,
    settings: Settings | None = None,
    db: FakeDB | None = None,
    storage: FakeStorage | None = None,
    embeddings: FakeEmbeddingsService | None = None,
    generator_llm: ScriptedLLM | None = None,
    judge_llm: ScriptedLLM | None = None,
) -> Services:
    return Services(
        settings=settings or make_settings(),
        db=db or FakeDB(),
        storage=storage or FakeStorage(),
        embeddings=embeddings or FakeEmbeddingsService(),
        generator_llm=generator_llm or ScriptedLLM([]),
        judge_llm=judge_llm or ScriptedLLM([]),
    )


@pytest.fixture
def pdf_bytes_factory():
    return make_pdf_bytes


@pytest.fixture
def job_factory():
    return make_job


@pytest.fixture
def settings_factory():
    return make_settings


@pytest.fixture
def services_factory():
    return make_services
