import logging
import math
import os
import re

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_EMBEDDING_MODEL = os.getenv(
    "OPENROUTER_EMBEDDING_MODEL", "openai/text-embedding-3-small"
)
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def chunk_text(text: str, window_tokens: int = 1300, overlap_ratio: float = 0.12) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()

    window_chars = window_tokens * 4
    overlap_chars = int(window_chars * overlap_ratio)
    step = window_chars - overlap_chars

    if len(normalized) <= window_chars:
        return [normalized]

    chunks: list[str] = []
    for start in range(0, len(normalized), step):
        chunk = normalized[start : start + window_chars]
        if chunk.strip():
            chunks.append(chunk)
    return chunks


def _cosine_similarity(v1: list[float], v2: list[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    norm = math.sqrt(sum(a * a for a in v1)) * math.sqrt(sum(b * b for b in v2))
    return dot / norm if norm else 0.0


def rank_chunks_by_topic(chunks: list[str], topic: str, embeddings_client) -> list[str]:
    response = embeddings_client.embeddings.create(
        model=OPENROUTER_EMBEDDING_MODEL, input=[topic, *chunks]
    )
    topic_vector = response.data[0].embedding
    chunk_vectors = [record.embedding for record in response.data[1:]]

    scored = list(zip(chunks, chunk_vectors))
    scored.sort(key=lambda pair: _cosine_similarity(topic_vector, pair[1]), reverse=True)
    return [chunk for chunk, _ in scored]


def select_relevant_text(
    text: str, topic: str, target_count: int, embeddings_client=None
) -> str:
    chunks = chunk_text(text)
    k = min(len(chunks), max(3, min(10, math.ceil(target_count / 2))))

    logger.info("[Chunking] Document split into %d chunk(s), keeping top %d for topic '%s'", len(chunks), k, topic)

    if len(chunks) <= k:
        logger.info("[Chunking] Document short enough — using all %d chunk(s) as-is, no embeddings call", len(chunks))
        return " ".join(chunks)

    if embeddings_client is None:
        if not OPENROUTER_API_KEY:
            raise EnvironmentError("OPENROUTER_API_KEY is not set in environment variables")
        embeddings_client = OpenAI(api_key=OPENROUTER_API_KEY, base_url=OPENROUTER_BASE_URL)

    ranked = rank_chunks_by_topic(chunks, topic, embeddings_client)
    logger.info("[Chunking] Ranked %d chunk(s) by similarity to '%s', kept top %d", len(chunks), topic, k)
    return " ".join(ranked[:k])
