import json
from types import SimpleNamespace

import pytest

from helpers.qgen_graph.graph import run_generation
from helpers.qgen_graph.nodes import make_generate_node
from helpers.question_generator import _fingerprint


class FakeLLM:
    """Stands in for a LangChain chat model: .invoke(prompt) -> obj with
    .content. Responses are scripted up front and popped one per call, so a
    test can simulate a whole multi-round generate<->judge conversation."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []  # recorded prompts, in call order

    def invoke(self, prompt):
        self.calls.append(prompt)
        content = self.responses.pop(0)
        return SimpleNamespace(content=content)


def q(text, correct="A", explanation="Because reasons."):
    return {
        "question_text": text,
        "options": ["A. opt1", "B. opt2", "C. opt3", "D. opt4"],
        "correct_option": correct,
        "explanation": explanation,
    }


def gen_response(questions):
    return json.dumps(questions)


def judge_response(decisions):
    return json.dumps({"decisions": decisions})


def test_judge_partial_rejection_next_round_requests_only_shortfall():
    q1, q2, q3, q4 = (
        q("What is A?"),
        q("What is B?"),
        q("What is C?"),
        q("What is D?"),
    )
    fake = FakeLLM([
        gen_response([q1, q2, q3]),                              # round1 generate
        judge_response([                                          # round1 judge: reject q3
            {"index": 0, "accept": True, "reason": "ok"},
            {"index": 1, "accept": True, "reason": "ok"},
            {"index": 2, "accept": False, "reason": "off-topic"},
        ]),
        gen_response([q4]),                                       # round2 generate (shortfall=1)
        judge_response([{"index": 0, "accept": True, "reason": "ok"}]),  # round2 judge
    ])

    result = run_generation(
        source_text="some source text",
        topic="Topic",
        difficulty="medium",
        target_count=3,
        llm=fake,
    )

    assert len(result) == 3
    assert len(fake.calls) == 4
    # round2's generate prompt must ask for exactly the shortfall (1), not 3
    assert "Generate exactly 1 unique multiple-choice questions" in fake.calls[2]


def test_judge_rejects_everything_for_max_rounds_raises_runtime_error():
    fake = FakeLLM([
        gen_response([q("What is A?"), q("What is B?")]),
        judge_response([
            {"index": 0, "accept": False, "reason": "off-topic"},
            {"index": 1, "accept": False, "reason": "off-topic"},
        ]),
        gen_response([q("What is C?"), q("What is D?")]),
        judge_response([
            {"index": 0, "accept": False, "reason": "off-topic"},
            {"index": 1, "accept": False, "reason": "off-topic"},
        ]),
    ])

    with pytest.raises(RuntimeError):
        run_generation(
            source_text="some source text",
            topic="Topic",
            difficulty="medium",
            target_count=3,
            llm=fake,
            max_rounds=2,
        )

    assert len(fake.calls) == 4


def test_semantic_duplicate_is_filtered_by_judge_even_with_different_md5():
    q1 = q("What is photosynthesis?")
    q2 = q("Explain photosynthesis in different words?")  # different text/hash, same meaning

    fake = FakeLLM([
        gen_response([q1, q2]),
        judge_response([
            {"index": 0, "accept": True, "reason": "ok"},
            {"index": 1, "accept": False, "reason": "semantic duplicate of index 0"},
        ]),
    ])

    result = run_generation(
        source_text="some source text",
        topic="Photosynthesis",
        difficulty="easy",
        target_count=1,
        llm=fake,
    )

    assert len(fake.calls) == 2
    assert len(result) == 1
    assert result[0]["question_text"] == q1["question_text"]


def test_exact_duplicate_filtered_before_reaching_judge_prompt():
    """Unit-level: make_generate_node must MD5-dedupe a candidate that
    exactly matches something already in `collected` (via seen_hashes)
    before it ever becomes a candidate handed to the judge."""
    existing_text = "What is the powerhouse of the cell?"
    new_text = "What is the function of ribosomes?"

    fake = FakeLLM([gen_response([q(existing_text), q(new_text)])])
    node = make_generate_node(fake)

    state = {
        "source_text": "cell biology text",
        "topic": "Cell Biology",
        "difficulty": "easy",
        "target_count": 2,
        "collected": [q(existing_text)],
        "candidates": [],
        "seen_hashes": {_fingerprint(existing_text)},
        "round": 0,
        "max_rounds": 5,
    }

    result = node(state)

    candidate_texts = [c["question_text"] for c in result["candidates"]]
    assert candidate_texts == [new_text]


def test_exact_duplicate_across_rounds_never_appears_in_judge_prompt():
    q1 = q("What is gravity?")
    q2 = q("What is mass?")

    fake = FakeLLM([
        gen_response([q1]),                                              # round1 generate
        judge_response([{"index": 0, "accept": True, "reason": "ok"}]),   # round1 judge
        gen_response([q1, q2]),                                          # round2 generate: q1 is an exact dup
        judge_response([{"index": 0, "accept": True, "reason": "ok"}]),   # round2 judge (only sees q2)
    ])

    result = run_generation(
        source_text="physics text",
        topic="Physics",
        difficulty="medium",
        target_count=2,
        llm=fake,
    )

    round2_judge_prompt = fake.calls[3]
    assert "[1] Question:" not in round2_judge_prompt
    assert q2["question_text"] in round2_judge_prompt

    result_texts = {r["question_text"] for r in result}
    assert result_texts == {q1["question_text"], q2["question_text"]}


def test_happy_path_one_round_exactly_two_invokes():
    q1, q2 = q("What is A?"), q("What is B?")
    fake = FakeLLM([
        gen_response([q1, q2]),
        judge_response([
            {"index": 0, "accept": True, "reason": "ok"},
            {"index": 1, "accept": True, "reason": "ok"},
        ]),
    ])

    result = run_generation(
        source_text="some source text",
        topic="Topic",
        difficulty="medium",
        target_count=2,
        llm=fake,
    )

    assert len(fake.calls) == 2
    assert len(result) == 2


def test_run_generation_truncates_final_result_to_target_count():
    q1, q2, q3 = q("What is A?"), q("What is B?"), q("What is C?")
    fake = FakeLLM([
        gen_response([q1, q2, q3]),
        judge_response([
            {"index": 0, "accept": True, "reason": "ok"},
            {"index": 1, "accept": True, "reason": "ok"},
            {"index": 2, "accept": True, "reason": "ok"},
        ]),
    ])

    result = run_generation(
        source_text="some source text",
        topic="Topic",
        difficulty="medium",
        target_count=2,
        llm=fake,
    )

    assert len(result) == 2
