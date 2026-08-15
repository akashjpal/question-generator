from src.graph.nodes.select_chunks import make_select_chunks_node
from tests.conftest import make_job, make_services


async def test_select_chunks_ranks_by_topic_similarity():
    chunks = ["about dogs", "about cats", "about photosynthesis", "about rocks"]
    topic_vec = [1.0, 0.0, 0.0, 0.0]
    vectors = {
        "about photosynthesis": [1.0, 0.0, 0.0, 0.0],  # identical to topic -> top match
        "about dogs": [0.0, 1.0, 0.0, 0.0],
        "about cats": [0.0, 0.9, 0.1, 0.0],
        "about rocks": [0.0, 0.0, 0.0, 1.0],
    }
    services = make_services()
    node = make_select_chunks_node(services)

    result = await node(
        {
            "job": make_job(topic="Photosynthesis", noOfQuestion=1),
            "num_questions": 1,
            "chunks": chunks,
            "chunk_embeddings": [vectors[c] for c in chunks],
            "topic_embedding": topic_vec,
        }
    )

    # k = min(4, max(1, 2)) = 2 -> top 2 by similarity, sorted back to doc order
    selected_texts = [chunks[i] for i in result["selected_chunk_ids"]]
    assert "about photosynthesis" in selected_texts


async def test_select_chunks_spreads_evenly_when_no_topic():
    chunks = [f"chunk-{i}" for i in range(10)]
    services = make_services()
    node = make_select_chunks_node(services)

    result = await node(
        {
            "job": make_job(topic=None, noOfQuestion=3),
            "num_questions": 3,
            "chunks": chunks,
            "chunk_embeddings": [[0.0] for _ in chunks],
            "topic_embedding": None,
        }
    )

    ids = result["selected_chunk_ids"]
    assert ids == sorted(ids)
    assert ids[0] == 0
    assert ids[-1] == len(chunks) - 1  # spread covers start and end of the doc


async def test_select_chunks_uses_all_when_fewer_chunks_than_questions():
    chunks = ["only one chunk"]
    services = make_services()
    node = make_select_chunks_node(services)

    result = await node(
        {
            "job": make_job(topic=None, noOfQuestion=5),
            "num_questions": 5,
            "chunks": chunks,
            "chunk_embeddings": [[0.0]],
            "topic_embedding": None,
        }
    )

    assert result["selected_chunk_ids"] == [0]
