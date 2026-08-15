from src.models.state import PipelineState
from src.services import status
from src.services.container import Services


def make_fetch_pdf_node(services: Services):
    async def fetch_pdf(state: PipelineState) -> dict:
        job = state["job"]
        await status.update_stage(services.db, job.job_id, "fetch_pdf")
        pdf_bytes = await services.storage.download_pdf(job.file_id)
        return {"pdf_bytes": pdf_bytes}

    return fetch_pdf
