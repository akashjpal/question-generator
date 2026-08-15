from datetime import datetime, timezone

from src.graph.errors import TransientJobError
from src.models.state import PipelineState
from src.services import status
from src.services.container import Services

# How old an "in_progress" row can be before we treat it as abandoned
# (crashed attempt) rather than actively owned by another in-flight run.
# Derived from sqs_visibility_timeout, not visibility_heartbeat_interval —
# it must stay BELOW the visibility timeout, or a crashed worker's job waits
# through one extra, wasted SQS redelivery before recovery kicks in (see
# RCA_Bug_StaleAfterExceedsVisibilityTimeout.md). Margin is generous on
# purpose in both directions: false positives here mean double-processing,
# false negatives just mean waiting one more redelivery.
_STALE_AFTER_SAFETY_MARGIN_SECONDS = 20
_STALE_AFTER_FLOOR_SECONDS = 30


def make_validate_node(services: Services):
    async def validate(state: PipelineState) -> dict:
        job = state["job"]
        await status.update_stage(services.db, job.job_id, "validate")

        row = await services.db.ensure_job_row(job.job_id)

        if row["status"] in ("completed", "completed_partial"):
            # Redelivered message after a successful attempt whose SQS
            # delete didn't land — nothing to redo, nothing to persist again.
            return {"skip_reason": f"job already {row['status']}"}

        if row["status"] == "in_progress":
            updated_at = _parse_timestamp(row.get("updated_at"))
            stale_after = max(
                services.settings.sqs_visibility_timeout - _STALE_AFTER_SAFETY_MARGIN_SECONDS,
                _STALE_AFTER_FLOOR_SECONDS,
            )
            if updated_at is not None and (datetime.now(timezone.utc) - updated_at).total_seconds() < stale_after:
                raise TransientJobError(
                    f"job {job.job_id} already in_progress and recently updated — "
                    "leaving message for SQS visibility timeout to arbitrate"
                )
            # else: stale row from a crashed attempt — fall through and retry.

        attempt_count = int(row.get("attempt_count") or 0) + 1
        await services.db.increment_attempt(job.job_id, attempt_count)

        return {"skip_reason": None, "warnings": []}

    return validate


def _parse_timestamp(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
