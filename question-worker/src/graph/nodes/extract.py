import fitz  # PyMuPDF

from src.graph.errors import PermanentJobError
from src.models.state import PipelineState
from src.services import status
from src.services.container import Services


def make_extract_node(services: Services):
    async def extract(state: PipelineState) -> dict:
        job = state["job"]
        await status.update_stage(services.db, job.job_id, "extract")

        try:
            doc = fitz.open(stream=state["pdf_bytes"], filetype="pdf")
            text = "".join(page.get_text() for page in doc)
            doc.close()
        except Exception as exc:
            raise PermanentJobError(f"Could not open PDF: {exc}", stage="extract") from exc

        if len(text.strip()) < services.settings.min_extracted_chars:
            raise PermanentJobError(
                "PDF appears scanned or empty — no extractable text", stage="extract"
            )

        num_questions = job.num_questions
        warnings = list(state.get("warnings") or [])
        min_chars_needed = num_questions * services.settings.min_chars_per_question
        if len(text) < min_chars_needed:
            clamped = max(1, len(text) // services.settings.min_chars_per_question)
            warnings.append(
                f"Document too short for {num_questions} questions; clamped to {clamped}"
            )
            num_questions = clamped

        return {
            "raw_text": text,
            "num_questions": num_questions,
            "warnings": warnings,
            # Initialize the generate<->judge loop's counters here, once,
            # right after the effective question count is known.
            "needed": num_questions,
            "regeneration_round": 0,
        }

    return extract
