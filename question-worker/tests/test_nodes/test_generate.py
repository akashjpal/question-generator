import json

from src.graph.nodes.generate import make_generate_node
from tests.conftest import ScriptedLLM, make_job, make_services

_BASE_STATE = {
    "job": make_job(),
    "selected_chunk_ids": [0, 1],
    "selected_chunks": ["Chunk zero text.", "Chunk one text."],
    "needed": 2,
    "rejected": [],
}

_VALID_RESPONSE = json.dumps(
    [
        {
            "question_text": "What does chunk zero say?",
            "options": ["A opt", "B opt", "C opt", "D opt"],
            "correct_option": "a",
            "explanation": "Because chunk zero says so.",
            "source_chunk_ids": [0],
        }
    ]
)


async def test_generate_parses_valid_json_and_normalizes_correct_option():
    llm = ScriptedLLM([_VALID_RESPONSE])
    services = make_services(generator_llm=llm)
    node = make_generate_node(services)

    result = await node(dict(_BASE_STATE))

    assert len(result["candidates"]) == 1
    assert result["candidates"][0].correct_option == "A"


async def test_generate_tolerates_markdown_fences_and_surrounding_prose():
    wrapped = f"Sure, here you go:\n```json\n{_VALID_RESPONSE}\n```\nHope that helps!"
    llm = ScriptedLLM([wrapped])
    services = make_services(generator_llm=llm)
    node = make_generate_node(services)

    result = await node(dict(_BASE_STATE))

    assert len(result["candidates"]) == 1


async def test_generate_drops_malformed_items_but_keeps_valid_ones():
    malformed = json.dumps(
        [
            {"question_text": "missing fields"},
            json.loads(_VALID_RESPONSE)[0],
        ]
    )
    llm = ScriptedLLM([malformed])
    services = make_services(generator_llm=llm)
    node = make_generate_node(services)

    result = await node(dict(_BASE_STATE))

    assert len(result["candidates"]) == 1


async def test_generate_prompt_includes_avoid_list_on_regeneration_round():
    from src.models.outputs import RejectedQuestion

    llm = ScriptedLLM([_VALID_RESPONSE])
    services = make_services(generator_llm=llm)
    node = make_generate_node(services)
    state = dict(_BASE_STATE)
    state["rejected"] = [RejectedQuestion(text="Old bad question?", reason="dup", source="dedupe", round=1)]

    await node(state)

    assert "Old bad question?" in llm.prompts[0]
