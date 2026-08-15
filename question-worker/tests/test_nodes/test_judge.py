import json

from src.graph.nodes.judge import make_judge_node
from src.models.outputs import GeneratedQuestion
from tests.conftest import ScriptedLLM, make_job, make_services


def _q(text: str) -> GeneratedQuestion:
    return GeneratedQuestion(
        question_text=text, options=["a", "b", "c", "d"], correct_option="A", explanation="x"
    )


async def test_judge_accepts_and_rejects_by_verdict():
    candidates = [_q("good question"), _q("bad question")]
    verdicts = json.dumps(
        {
            "verdicts": [
                {
                    "question_index": 0,
                    "difficulty_match": True,
                    "topic_relevant": True,
                    "grounded_in_source": True,
                    "accept": True,
                    "reason": "solid",
                },
                {
                    "question_index": 1,
                    "difficulty_match": False,
                    "topic_relevant": True,
                    "grounded_in_source": True,
                    "accept": False,
                    "reason": "wrong difficulty",
                },
            ]
        }
    )
    llm = ScriptedLLM([verdicts])
    services = make_services(judge_llm=llm)
    node = make_judge_node(services)

    result = await node(
        {
            "job": make_job(noOfQuestion=2),
            "num_questions": 2,
            "candidates": candidates,
            "selected_chunk_ids": [0],
            "selected_chunks": ["chunk text"],
            "accepted": [],
            "regeneration_round": 0,
        }
    )

    assert len(result["accepted"]) == 1
    assert result["accepted"][0].question_text == "good question"
    assert len(result["rejected"]) == 1
    assert result["rejected"][0].reason == "wrong difficulty"
    assert result["needed"] == 1
    assert result["regeneration_round"] == 1


async def test_judge_missing_verdict_index_is_conservatively_rejected():
    candidates = [_q("only question")]
    llm = ScriptedLLM([json.dumps({"verdicts": []})])
    services = make_services(judge_llm=llm)
    node = make_judge_node(services)

    result = await node(
        {
            "job": make_job(noOfQuestion=1),
            "num_questions": 1,
            "candidates": candidates,
            "selected_chunk_ids": [0],
            "selected_chunks": ["chunk text"],
            "accepted": [],
            "regeneration_round": 0,
        }
    )

    assert result["accepted"] == []
    assert result["rejected"][0].reason == "no verdict returned by judge"


async def test_judge_no_candidates_skips_llm_call():
    llm = ScriptedLLM([])
    services = make_services(judge_llm=llm)
    node = make_judge_node(services)

    result = await node(
        {
            "job": make_job(noOfQuestion=1),
            "num_questions": 1,
            "candidates": [],
            "selected_chunk_ids": [],
            "selected_chunks": [],
            "accepted": [],
            "regeneration_round": 0,
        }
    )

    assert result["accepted"] == []
    assert result["needed"] == 1
    assert llm.prompts == []
