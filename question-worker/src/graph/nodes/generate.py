import json
import re

from pydantic import ValidationError

from src.graph.errors import TransientJobError
from src.models.outputs import GeneratedQuestion
from src.models.state import PipelineState
from src.services import status
from src.services.container import Services
from src.utils.logging import get_logger

logger = get_logger()

DIFFICULTY_DEFINITIONS = {
    "easy": (
        "Directly stated facts from the text; a reader who skimmed the passage once "
        "could answer correctly. No inference required."
    ),
    "medium": (
        "Requires connecting two or more pieces of information from the text, or a "
        "straightforward inference from stated facts."
    ),
    "hard": (
        "Requires synthesizing multiple parts of the text, understanding implications, "
        "or distinguishing between subtly different concepts described in the passage."
    ),
}

_PROMPT_TEMPLATE = """You are generating multiple-choice questions (MCQs) strictly from the source material below.

SOURCE TEXT (each chunk tagged with its id in brackets):
{chunks_block}

TOPIC: {topic}
DIFFICULTY: {difficulty} — {difficulty_definition}

Generate exactly {count} multiple-choice questions grounded strictly in the source text above.
{avoid_block}
Each question must have exactly 4 options (A, B, C, D) with exactly one correct answer, and a brief
explanation of why that answer is correct, grounded in the source text. Set "source_chunk_ids" to the
chunk id(s) (from the brackets above) the question and answer are drawn from.

Respond with ONLY a JSON array, no prose, no markdown fences:
[
  {{
    "question_text": "...",
    "options": ["...", "...", "...", "..."],
    "correct_option": "A",
    "explanation": "...",
    "source_chunk_ids": [0]
  }}
]
"""


def _build_prompt(state: PipelineState) -> str:
    job = state["job"]
    chunks_block = "\n".join(
        f"[{cid}] {text}" for cid, text in zip(state["selected_chunk_ids"], state["selected_chunks"])
    )
    needed = state["needed"]
    count = needed + 2  # overshoot so dedupe/judge attrition doesn't force an extra round

    rejected = state.get("rejected") or []
    if rejected:
        avoid_list = "\n".join(f"- {r.text}" for r in rejected)
        avoid_block = f"\nDo NOT repeat or rephrase any of these previously-rejected questions:\n{avoid_list}\n"
    else:
        avoid_block = ""

    return _PROMPT_TEMPLATE.format(
        chunks_block=chunks_block,
        topic=job.topic or "(no specific topic — cover the document broadly)",
        difficulty=job.difficulty,
        difficulty_definition=DIFFICULTY_DEFINITIONS[job.difficulty],
        count=count,
        avoid_block=avoid_block,
    )


def _parse_candidates(raw: str) -> list[GeneratedQuestion]:
    clean = re.sub(r"```(?:json)?\s*", "", raw).strip().strip("`").strip()
    start = clean.find("[")
    end = clean.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON array found in generator response")
    data = json.loads(clean[start:end])

    candidates: list[GeneratedQuestion] = []
    for item in data:
        try:
            candidates.append(GeneratedQuestion.model_validate(item))
        except ValidationError as exc:
            logger.warning("dropping malformed generated candidate", error=str(exc))
    return candidates


def make_generate_node(services: Services):
    async def generate(state: PipelineState) -> dict:
        job = state["job"]
        await status.update_stage(services.db, job.job_id, "generate")

        prompt = _build_prompt(state)
        try:
            response = await services.generator_llm.ainvoke(prompt)
            candidates = _parse_candidates(response.content)
        except TransientJobError:
            raise
        except Exception as exc:
            raise TransientJobError(f"generate node failed: {exc}") from exc

        return {"candidates": candidates}

    return generate
