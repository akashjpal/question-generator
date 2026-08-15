from langchain_text_splitters import RecursiveCharacterTextSplitter

from src.graph.errors import PermanentJobError
from src.models.state import PipelineState
from src.services import status
from src.services.container import Services

_CHUNK_SIZE = 900
_CHUNK_OVERLAP = 120


def make_chunk_embed_node(services: Services):
    splitter = RecursiveCharacterTextSplitter(chunk_size=_CHUNK_SIZE, chunk_overlap=_CHUNK_OVERLAP)

    async def chunk_embed(state: PipelineState) -> dict:
        job = state["job"]
        await status.update_stage(services.db, job.job_id, "chunk_embed")

        chunks = splitter.split_text(state["raw_text"])
        if not chunks:
            raise PermanentJobError("No chunks produced from extracted text", stage="chunk_embed")

        texts_to_embed = [job.topic, *chunks] if job.topic else list(chunks)
        vectors = await services.embeddings.embed(texts_to_embed)

        if job.topic:
            topic_embedding, chunk_embeddings = vectors[0], vectors[1:]
        else:
            topic_embedding, chunk_embeddings = None, vectors

        return {
            "chunks": chunks,
            "chunk_embeddings": chunk_embeddings,
            "topic_embedding": topic_embedding,
        }

    return chunk_embed
