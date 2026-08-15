from helpers.chunking import chunk_text, rank_chunks_by_topic, select_relevant_text


class FakeEmbeddingRecord:
    def __init__(self, embedding):
        self.embedding = embedding


class FakeEmbeddingsResponse:
    def __init__(self, embeddings):
        self.data = [FakeEmbeddingRecord(e) for e in embeddings]


class FakeEmbeddings:
    def __init__(self, vectors_by_input):
        # vectors_by_input: dict mapping each expected input string -> vector
        self.vectors_by_input = vectors_by_input
        self.calls = []

    def create(self, model, input):
        self.calls.append({"model": model, "input": input})
        return FakeEmbeddingsResponse([self.vectors_by_input[text] for text in input])


class FakeEmbeddingsClient:
    def __init__(self, vectors_by_input):
        self.embeddings = FakeEmbeddings(vectors_by_input)


class RaisingEmbeddings:
    def create(self, model, input):
        raise AssertionError("should not be called")


class RaisingEmbeddingsClient:
    def __init__(self):
        self.embeddings = RaisingEmbeddings()


def test_chunk_text_short_string_returns_single_normalized_chunk():
    text = "  This   is\n\na   short   document.  "
    chunks = chunk_text(text)
    assert chunks == ["This is a short document."]


def test_chunk_text_long_string_produces_overlapping_chunks():
    # window_tokens=10 -> window_chars=40, overlap_ratio=0.25 -> overlap_chars=10, step=30
    # Use unique 4-char tokens (0000, 0001, ...) so the text has no repeating
    # period, making any overlap check unambiguous rather than a coincidence
    # of a periodic string.
    text = "".join(f"{i:04d}" for i in range(50))  # 200 chars, all unique content
    chunks = chunk_text(text, window_tokens=10, overlap_ratio=0.25)

    assert len(chunks) > 1
    # each chunk (except possibly the last) is exactly window_chars long
    for chunk in chunks[:-1]:
        assert len(chunk) == 40
    # adjacent chunks overlap: the last `overlap_chars` of one chunk equals
    # the first `overlap_chars` of the next chunk, verified against the known
    # source string at the expected step offset.
    step = 30
    for i in range(len(chunks) - 1):
        expected_overlap = text[(i + 1) * step : (i + 1) * step + 10]
        assert chunks[i + 1][:10] == expected_overlap
        assert chunks[i][-10:] == expected_overlap


def test_rank_chunks_by_topic_orders_most_similar_first():
    topic = "Photosynthesis"
    chunks = ["Chunk about volcanoes", "Chunk about photosynthesis in plants", "Chunk about cars"]

    vectors_by_input = {
        topic: [1.0, 0.0],
        chunks[0]: [0.0, 1.0],   # orthogonal to topic -> similarity 0
        chunks[1]: [1.0, 0.0],   # identical to topic -> similarity 1
        chunks[2]: [-1.0, 0.0],  # opposite to topic -> similarity -1
    }
    fake_client = FakeEmbeddingsClient(vectors_by_input)

    ranked = rank_chunks_by_topic(chunks, topic, fake_client)

    assert ranked == [chunks[1], chunks[0], chunks[2]]
    assert len(fake_client.embeddings.calls) == 1
    assert fake_client.embeddings.calls[0]["input"] == [topic] + chunks


def test_select_relevant_text_skips_embeddings_when_chunk_count_within_k():
    text = "A short document about photosynthesis."
    raising_client = RaisingEmbeddingsClient()

    result = select_relevant_text(
        text, topic="Photosynthesis", target_count=5, embeddings_client=raising_client
    )

    assert result == "A short document about photosynthesis."


def test_select_relevant_text_ranks_and_trims_when_chunk_count_exceeds_k():
    # Long enough to produce more chunks (12) than k will be for target_count=20
    # (k = max(3, min(10, ceil(20/2))) = 10), using default window_tokens=1300
    # (window_chars=5200, overlap_chars=624, step=4576). 12 chunks requires
    # length > 11 * 4576 = 50336.
    text = "tok" + " ".join(f"{i:05d}" for i in range(11000))
    topic = "Photosynthesis"

    chunks = chunk_text(text)
    assert len(chunks) > 10  # sanity check on our test data construction

    relevant_index = 5
    vectors_by_input = {topic: [1.0, 0.0]}
    for i, chunk in enumerate(chunks):
        vectors_by_input[chunk] = [1.0, 0.0] if i == relevant_index else [0.0, 1.0]

    fake_client = FakeEmbeddingsClient(vectors_by_input)

    result = select_relevant_text(
        text, topic=topic, target_count=20, embeddings_client=fake_client
    )

    k = 10
    expected_ranked = [chunks[relevant_index]] + [
        c for i, c in enumerate(chunks) if i != relevant_index
    ]
    expected_result = " ".join(expected_ranked[:k])

    assert result == expected_result
    assert len(fake_client.embeddings.calls) == 1
    assert fake_client.embeddings.calls[0]["input"] == [topic] + chunks
