from src.models.state import PipelineState
from src.services import status
from src.services.container import Services
from src.utils.logging import get_logger

logger = get_logger()


def make_persist_node(services: Services):
    async def persist(state: PipelineState) -> dict:
        job = state["job"]
        await status.update_stage(services.db, job.job_id, "persist")

        warnings = state.get("warnings") or []

        if state.get("error"):
            await services.db.set_final_status(
                job.job_id,
                "failed",
                error_reason=state["error"],
                progress_meta={"warnings": warnings},
            )
            logger.error("job failed permanently", reason=state["error"])
            return {}

        num_questions = state.get("num_questions", job.num_questions)
        accepted = state.get("accepted") or []
        rejected = state.get("rejected") or []
        final_accepted = accepted[:num_questions]

        final_status = "completed" if len(final_accepted) >= num_questions else "completed_partial"
        if final_status == "completed_partial":
            warnings = [
                *warnings,
                f"Only {len(final_accepted)}/{num_questions} unique {job.difficulty} questions "
                f"could be generated after {state.get('regeneration_round', 0)} round(s).",
            ]

        # persist is not a single cross-table DB transaction (Supabase REST
        # has no client-side transaction API) — see plan's noted deviation.
        # Each DBService call is independently idempotent (delete-then-insert
        # / upsert), so a retry of this whole node after a partial failure
        # converges to the same end state rather than duplicating rows.
        await services.db.legacy_save_questions(job.job_id, final_accepted)
        await services.db.insert_rejected(job.job_id, rejected)
        await services.db.set_final_status(
            job.job_id,
            final_status,
            progress_meta={
                "accepted": len(final_accepted),
                "requested": num_questions,
                "rejected": len(rejected),
                "rounds": state.get("regeneration_round", 0),
                "warnings": warnings,
            },
        )

        logger.info(
            "job persisted",
            status=final_status,
            accepted=len(final_accepted),
            requested=num_questions,
            rejected=len(rejected),
        )
        return {}

    return persist
