from typing import Literal

from supabase import AsyncClient, create_async_client

from src.config import Settings
from src.graph.errors import TransientJobError
from src.models.outputs import GeneratedQuestion, RejectedQuestion
from src.utils.retry import async_retry_transient

# Mirrors the legacy worker's Job Status Enum (CLAUDE.md) — the Node API's
# polling endpoint and the frontend both read ai-generated-question-status by
# this exact int, so it can't change independently of those services.
LEGACY_STATUS_QUEUED = 0
LEGACY_STATUS_PROCESSING = 1
LEGACY_STATUS_COMPLETED = 2
LEGACY_STATUS_FAILED = 3

JobStatus = Literal["queued", "in_progress", "completed", "completed_partial", "failed"]

_LEGACY_STATUS_MAP: dict[JobStatus, int] = {
    "queued": LEGACY_STATUS_QUEUED,
    "in_progress": LEGACY_STATUS_PROCESSING,
    "completed": LEGACY_STATUS_COMPLETED,
    "completed_partial": LEGACY_STATUS_COMPLETED,  # legacy enum has no "partial" — closest is "done"
    "failed": LEGACY_STATUS_FAILED,
}


def _wrap_db_error(exc: Exception, action: str) -> TransientJobError:
    return TransientJobError(f"DB {action} failed: {exc}")


class DBService:
    """All Supabase access for this worker. Every write here is dual-scope:
    the new generation_jobs/generation_job_rejected_questions tables (rich,
    source of truth for this worker), and — where noted — the pre-existing
    ai-generated-question-status/ai-generated-questions tables the Node API
    and frontend read directly. See question_worker_implementation_plan.md's
    'Dual-write for compatibility' decision."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._client: AsyncClient | None = None

    async def _get_client(self) -> AsyncClient:
        if self._client is None:
            self._client = await create_async_client(
                self._settings.supabase_url, self._settings.supabase_service_role_key
            )
        return self._client

    # ------------------------------------------------------------------
    # generation_jobs — new, rich status model
    # ------------------------------------------------------------------

    @async_retry_transient
    async def get_job(self, job_id: str) -> dict | None:
        client = await self._get_client()
        try:
            resp = await client.table("generation_jobs").select("*").eq("job_id", job_id).limit(1).execute()
        except Exception as exc:
            raise _wrap_db_error(exc, "get_job") from exc
        return resp.data[0] if resp.data else None

    @async_retry_transient
    async def ensure_job_row(self, job_id: str) -> dict:
        """INSERT ... ON CONFLICT DO NOTHING, then read back — idempotent
        regardless of whether this call created the row or an earlier
        (redelivered) attempt already did."""
        client = await self._get_client()
        try:
            await client.table("generation_jobs").upsert(
                {"job_id": job_id, "status": "queued", "attempt_count": 0},
                on_conflict="job_id",
                ignore_duplicates=True,
            ).execute()
        except Exception as exc:
            raise _wrap_db_error(exc, "ensure_job_row") from exc
        row = await self.get_job(job_id)
        if row is None:
            raise TransientJobError(f"generation_jobs row for {job_id} missing immediately after upsert")
        return row

    @async_retry_transient
    async def set_stage(self, job_id: str, stage: str) -> None:
        client = await self._get_client()
        try:
            await client.table("generation_jobs").update({"stage": stage}).eq("job_id", job_id).execute()
        except Exception as exc:
            raise _wrap_db_error(exc, "set_stage") from exc

    @async_retry_transient
    async def increment_attempt(self, job_id: str, attempt_count: int) -> None:
        client = await self._get_client()
        try:
            await client.table("generation_jobs").update(
                {"attempt_count": attempt_count, "status": "in_progress"}
            ).eq("job_id", job_id).execute()
        except Exception as exc:
            raise _wrap_db_error(exc, "increment_attempt") from exc

    @async_retry_transient
    async def set_final_status(
        self,
        job_id: str,
        status: JobStatus,
        *,
        error_reason: str | None = None,
        progress_meta: dict | None = None,
    ) -> None:
        client = await self._get_client()
        payload: dict = {"status": status}
        if error_reason is not None:
            payload["error_reason"] = error_reason
        if progress_meta is not None:
            payload["progress_meta"] = progress_meta
        try:
            await client.table("generation_jobs").update(payload).eq("job_id", job_id).execute()
        except Exception as exc:
            raise _wrap_db_error(exc, "set_final_status") from exc

        # Dual-write: existing polling contract other services depend on.
        try:
            await client.table("ai-generated-question-status").update(
                {"status": _LEGACY_STATUS_MAP[status]}
            ).eq("id", job_id).execute()
        except Exception as exc:
            raise _wrap_db_error(exc, "legacy set_final_status") from exc

    @async_retry_transient
    async def insert_rejected(self, job_id: str, rejected: list[RejectedQuestion]) -> None:
        """Delete-then-insert, same idempotency pattern as legacy_save_questions
        — a retried persist node (e.g. after set_final_status transiently
        failed) must not duplicate rejection rows."""
        client = await self._get_client()
        try:
            await client.table("generation_job_rejected_questions").delete().eq("job_id", job_id).execute()
            if rejected:
                rows = [
                    {
                        "job_id": job_id,
                        "round": r.round,
                        "question_text": r.text,
                        "reason": r.reason,
                        "source": r.source,
                    }
                    for r in rejected
                ]
                await client.table("generation_job_rejected_questions").insert(rows).execute()
        except Exception as exc:
            raise _wrap_db_error(exc, "insert_rejected") from exc

    # ------------------------------------------------------------------
    # Legacy tables — dual-write targets
    # ------------------------------------------------------------------

    @async_retry_transient
    async def legacy_save_questions(self, job_id: str, questions: list[GeneratedQuestion]) -> None:
        """Idempotent like the legacy worker's save_questions_to_db: delete
        any rows a previous (failed-after-save) attempt already inserted for
        this job_id before inserting again, so an SQS redelivery can't
        duplicate questions."""
        if not questions:
            return
        client = await self._get_client()
        rows = [
            {
                "jobId": job_id,
                "question_text": q.question_text,
                "options": q.options,
                "correct_options": q.correct_option,
                "explanation": q.explanation,
            }
            for q in questions
        ]
        try:
            await client.table("ai-generated-questions").delete().eq("jobId", job_id).execute()
            await client.table("ai-generated-questions").insert(rows).execute()
        except Exception as exc:
            raise _wrap_db_error(exc, "legacy_save_questions") from exc
