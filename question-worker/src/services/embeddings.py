from openai import AsyncOpenAI

from src.config import Settings
from src.graph.errors import TransientJobError
from src.utils.retry import async_retry_transient


class EmbeddingsService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = AsyncOpenAI(api_key=settings.openrouter_api_key, base_url=settings.openrouter_base_url)

    @async_retry_transient
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Single batched call — cheaper and avoids N round-trips for N chunks."""
        if not texts:
            return []
        try:
            response = await self._client.embeddings.create(model=self._settings.embedding_model, input=texts)
        except Exception as exc:
            raise TransientJobError(f"Embeddings call failed: {exc}") from exc
        return [record.embedding for record in response.data]
