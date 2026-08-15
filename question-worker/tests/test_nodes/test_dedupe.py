from src.graph.nodes.dedupe import make_dedupe_node
from src.models.outputs import GeneratedQuestion
from tests.conftest import FakeEmbeddingsService, make_job, make_services


def _q(text: str) -> GeneratedQuestion:
    return GeneratedQuestion(
        question_text=text, options=["a", "b", "c", "d"], correct_option="A", explanation="x"
    )


async def test_dedupe_rejects_near_duplicate_within_batch():
    q1, q2 = _q("What is photosynthesis?"), _q("What is photosynthesis, exactly?")
    vectors = {q1.question_text: [1.0, 0.0], q2.question_text: [0.99, 0.01]}
    embeddings = FakeEmbeddingsService(vectors=vectors, dim=2)
    services = make_services(embeddings=embeddings, settings=make_services().settings)
    node = make_dedupe_node(services)

    result = await node({"job": make_job(), "candidates": [q1, q2], "accepted": [], "regeneration_round": 0})

    assert len(result["candidates"]) == 1
    assert len(result["rejected"]) == 1
    assert result["rejected"][0].source == "dedupe"


async def test_dedupe_rejects_duplicate_of_already_accepted():
    accepted_q = _q("What is mitosis?")
    candidate = _q("What is mitosis, in short?")
    vectors = {accepted_q.question_text: [1.0, 0.0], candidate.question_text: [1.0, 0.0]}
    embeddings = FakeEmbeddingsService(vectors=vectors, dim=2)
    services = make_services(embeddings=embeddings)
    node = make_dedupe_node(services)

    result = await node(
        {"job": make_job(), "candidates": [candidate], "accepted": [accepted_q], "regeneration_round": 0}
    )

    assert result["candidates"] == []
    assert len(result["rejected"]) == 1


async def test_dedupe_keeps_distinct_questions():
    q1, q2 = _q("What is photosynthesis?"), _q("What is the capital of France?")
    vectors = {q1.question_text: [1.0, 0.0], q2.question_text: [0.0, 1.0]}
    embeddings = FakeEmbeddingsService(vectors=vectors, dim=2)
    services = make_services(embeddings=embeddings)
    node = make_dedupe_node(services)

    result = await node({"job": make_job(), "candidates": [q1, q2], "accepted": [], "regeneration_round": 0})

    assert len(result["candidates"]) == 2
    assert result["rejected"] == []


async def test_dedupe_no_candidates_is_a_noop():
    services = make_services()
    node = make_dedupe_node(services)

    result = await node({"job": make_job(), "candidates": [], "accepted": [], "regeneration_round": 0})

    assert result == {"candidates": []}
