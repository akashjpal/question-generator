from src.graph.nodes.chunk_embed import make_chunk_embed_node
from tests.conftest import FakeEmbeddingsService, make_job, make_services


async def test_chunk_embed_with_topic_embeds_topic_and_chunks_separately():
    embeddings = FakeEmbeddingsService()
    services = make_services(embeddings=embeddings)
    node = make_chunk_embed_node(services)
    text = "Sentence one. " * 200  # long enough to split into multiple chunks

    result = await node({"job": make_job(topic="Cells"), "raw_text": text})

    assert len(result["chunks"]) > 1
    assert result["topic_embedding"] is not None
    assert len(result["chunk_embeddings"]) == len(result["chunks"])
    # First embed() call includes topic + all chunks together (one batched call).
    assert embeddings.calls[0][0] == "Cells"


async def test_chunk_embed_without_topic_skips_topic_embedding():
    embeddings = FakeEmbeddingsService()
    services = make_services(embeddings=embeddings)
    node = make_chunk_embed_node(services)

    result = await node({"job": make_job(topic=None), "raw_text": "Short single-chunk text."})

    assert result["topic_embedding"] is None
    assert len(result["chunk_embeddings"]) == len(result["chunks"])
