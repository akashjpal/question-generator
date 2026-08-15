from langgraph.graph import END, START, StateGraph
from langgraph.types import RetryPolicy

from src.graph.errors import PermanentJobError, TransientJobError
from src.graph.nodes.chunk_embed import make_chunk_embed_node
from src.graph.nodes.dedupe import make_dedupe_node
from src.graph.nodes.extract import make_extract_node
from src.graph.nodes.fetch_pdf import make_fetch_pdf_node
from src.graph.nodes.generate import make_generate_node
from src.graph.nodes.judge import make_judge_node
from src.graph.nodes.persist import make_persist_node
from src.graph.nodes.select_chunks import make_select_chunks_node
from src.graph.nodes.validate import make_validate_node
from src.models.job import JobPayload
from src.models.state import PipelineState
from src.services.container import Services


def _capture_permanent_error(node_fn):
    """PermanentJobError raised by a node is not a LangGraph-level failure —
    it's routed to `persist` with status=failed via the `error` state key, so
    the consumer still gets a clean graph completion (and deletes the SQS
    message). TransientJobError is left to propagate uncaught, so the node's
    own RetryPolicy — and ultimately the whole graph.ainvoke() call — sees it
    and the message stays on the queue for redelivery."""

    async def wrapped(state: PipelineState) -> dict:
        try:
            return await node_fn(state)
        except PermanentJobError as exc:
            return {"error": str(exc)}

    return wrapped


def _route_after_validate(state: PipelineState) -> str:
    if state.get("error"):
        return "persist"
    if state.get("skip_reason"):
        return "end"
    return "fetch_pdf"


def _simple_router(next_node: str):
    def router(state: PipelineState) -> str:
        return "persist" if state.get("error") else next_node

    return router


def _judge_router(max_rounds: int):
    def router(state: PipelineState) -> str:
        if state.get("error"):
            return "persist"
        if state["needed"] <= 0:
            return "persist"
        if state["regeneration_round"] < max_rounds:
            return "generate"
        # Rounds exhausted with a shortfall — persist handles the
        # completed_partial status from state["accepted"] vs num_questions.
        return "persist"

    return router


def build_graph(services: Services):
    transient_retry = RetryPolicy(max_attempts=3, retry_on=TransientJobError)

    graph = StateGraph(PipelineState)

    graph.add_node("validate", _capture_permanent_error(make_validate_node(services)), retry_policy=transient_retry)
    graph.add_node("fetch_pdf", _capture_permanent_error(make_fetch_pdf_node(services)), retry_policy=transient_retry)
    graph.add_node("extract", _capture_permanent_error(make_extract_node(services)), retry_policy=transient_retry)
    graph.add_node(
        "chunk_embed", _capture_permanent_error(make_chunk_embed_node(services)), retry_policy=transient_retry
    )
    graph.add_node(
        "select_chunks", _capture_permanent_error(make_select_chunks_node(services)), retry_policy=transient_retry
    )
    graph.add_node("generate", _capture_permanent_error(make_generate_node(services)), retry_policy=transient_retry)
    graph.add_node("dedupe", _capture_permanent_error(make_dedupe_node(services)), retry_policy=transient_retry)
    graph.add_node("judge", _capture_permanent_error(make_judge_node(services)), retry_policy=transient_retry)
    graph.add_node("persist", make_persist_node(services), retry_policy=transient_retry)

    graph.add_edge(START, "validate")
    graph.add_conditional_edges(
        "validate", _route_after_validate, {"fetch_pdf": "fetch_pdf", "persist": "persist", "end": END}
    )
    graph.add_conditional_edges("fetch_pdf", _simple_router("extract"), {"extract": "extract", "persist": "persist"})
    graph.add_conditional_edges(
        "extract", _simple_router("chunk_embed"), {"chunk_embed": "chunk_embed", "persist": "persist"}
    )
    graph.add_conditional_edges(
        "chunk_embed", _simple_router("select_chunks"), {"select_chunks": "select_chunks", "persist": "persist"}
    )
    graph.add_conditional_edges(
        "select_chunks", _simple_router("generate"), {"generate": "generate", "persist": "persist"}
    )
    graph.add_conditional_edges("generate", _simple_router("dedupe"), {"dedupe": "dedupe", "persist": "persist"})
    graph.add_conditional_edges("dedupe", _simple_router("judge"), {"judge": "judge", "persist": "persist"})
    graph.add_conditional_edges(
        "judge",
        _judge_router(services.settings.max_regeneration_rounds),
        {"generate": "generate", "persist": "persist"},
    )
    graph.add_edge("persist", END)

    return graph.compile()


async def run_job(graph, job: JobPayload) -> PipelineState:
    initial_state: PipelineState = {"job": job}
    return await graph.ainvoke(initial_state)
