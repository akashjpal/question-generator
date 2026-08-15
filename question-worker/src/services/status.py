from src.services.db import DBService
from src.utils.logging import get_logger

logger = get_logger()


async def update_stage(db: DBService, job_id: str, stage: str) -> None:
    """Called as the first action of every graph node (see plan section 7) —
    this is what a future polling endpoint over generation_jobs would read to
    show progress."""
    logger.info("stage", stage=stage)
    await db.set_stage(job_id, stage)
