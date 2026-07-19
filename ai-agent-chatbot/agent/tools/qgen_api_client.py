"""
Thin async wrapper around the existing question-generator-api-ts HTTP
endpoints. This is the ONLY place the agent talks to that service — every
tool in langchain_tools.py goes through here rather than touching Supabase
or the LLM provider directly, per the confirmed "reuse the TS API" architecture.

Every call forwards the *teacher's own* Supabase bearer token, exactly like
the Angular client's create-assessment.ts does today.
"""
import logging
from typing import Any

import httpx

import config

logger = logging.getLogger(__name__)


class QGenApiError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class QGenApiClient:
    def __init__(self, bearer_token: str, base_url: str | None = None):
        self._token = bearer_token
        self._base_url = (base_url or config.QUESTION_GENERATOR_API_URL).rstrip("/")

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {self._token}"}
        if extra:
            headers.update(extra)
        return headers

    async def upload_file(self, file_bytes: bytes, file_name: str) -> dict[str, Any]:
        """POST /file-upload — raw PDF body, x-filename header."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self._base_url}/file-upload",
                content=file_bytes,
                headers=self._headers({
                    "Content-Type": "application/pdf",
                    "x-filename": file_name,
                }),
            )
        self._raise_for_status(resp, "upload_file")
        return resp.json()

    async def start_generation(
        self,
        file_id: str,
        file_name: str,
        topic: str,
        difficulty: str,
        num_questions: int,
    ) -> dict[str, Any]:
        """POST /generate-questions -> {message, jobId, topic}"""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self._base_url}/generate-questions",
                json={
                    "fileName": file_name,
                    "fileId": file_id,
                    "noOfQuestion": num_questions,
                    "difficulty": difficulty,
                    "topic": topic,
                },
                headers=self._headers({"Content-Type": "application/json"}),
            )
        self._raise_for_status(resp, "start_generation")
        return resp.json()

    async def check_generation_status(self, job_id: str) -> int:
        """GET /generate-questions-status/:id -> int status (0/1/2/3)"""
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{self._base_url}/generate-questions-status/{job_id}",
                headers=self._headers(),
            )
        self._raise_for_status(resp, "check_generation_status")
        return resp.json()["status"]

    async def get_generated_questions(self, job_id: str) -> list[dict[str, Any]]:
        """GET /generated-questions/:id -> list of question dicts."""
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{self._base_url}/generated-questions/{job_id}",
                headers=self._headers(),
            )
        self._raise_for_status(resp, "get_generated_questions")
        return resp.json().get("questions", [])

    async def publish_assessment(self, assessment: dict[str, Any]) -> None:
        """POST /publish-assessment — body {assessment}. Echoes no row back."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self._base_url}/publish-assessment",
                json={"assessment": assessment},
                headers=self._headers({"Content-Type": "application/json"}),
            )
        self._raise_for_status(resp, "publish_assessment")

    async def get_assessment(self, assessment_id: int) -> dict[str, Any] | None:
        """GET /api/assessments/:id -> {assessment} — used to confirm publish."""
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{self._base_url}/api/assessments/{assessment_id}",
                headers=self._headers(),
            )
        if resp.status_code == 400:
            return None
        self._raise_for_status(resp, "get_assessment")
        return resp.json().get("assessment")

    async def update_assessment(self, assessment: dict[str, Any]) -> None:
        """POST /update-assessment — body {assessment}. Mirrors publish_assessment's shape."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self._base_url}/update-assessment",
                json={"assessment": assessment},
                headers=self._headers({"Content-Type": "application/json"}),
            )
        self._raise_for_status(resp, "update_assessment")

    async def check_join_code_available(self, code: str) -> bool:
        """GET /assessment-code-available/:code -> {available: bool}.

        New endpoint added to question-generator-api-ts (Phase 3) since no
        server-side uniqueness check existed before this feature.
        """
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{self._base_url}/assessment-code-available/{code}",
                headers=self._headers(),
            )
        self._raise_for_status(resp, "check_join_code_available")
        return bool(resp.json().get("available"))

    @staticmethod
    def _raise_for_status(resp: httpx.Response, op: str) -> None:
        if resp.status_code >= 400:
            logger.error("[QGenApiClient] %s failed (%s): %s", op, resp.status_code, resp.text)
            raise QGenApiError(f"{op} failed: {resp.status_code} {resp.text}", resp.status_code)
