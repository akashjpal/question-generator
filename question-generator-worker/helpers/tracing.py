import logging
import os

logger = logging.getLogger(__name__)


def setup_tracing(project_name: str = "question-generator") -> None:
    """Initialize Arize Phoenix OpenTelemetry tracing.

    Registers a global OTel TracerProvider that exports spans to Phoenix via
    OTLP gRPC, then auto-instruments the OpenAI SDK (used to call OpenRouter,
    an OpenAI-compatible endpoint) so every client.chat.completions.create()
    call is captured as an LLM span.

    No-ops gracefully when PHOENIX_COLLECTOR_ENDPOINT is not set, so the
    worker starts fine in environments where Phoenix is not running.
    """
    endpoint = os.getenv("PHOENIX_COLLECTOR_ENDPOINT")
    if not endpoint:
        logger.info("PHOENIX_COLLECTOR_ENDPOINT not set — tracing disabled")
        return

    try:
        from phoenix.otel import register
        from openinference.instrumentation.openai import OpenAIInstrumentor

        register(project_name=project_name, endpoint=endpoint)
        OpenAIInstrumentor().instrument()

        logger.info(
            "✅ Arize Phoenix tracing enabled → %s  (project: %s)",
            endpoint,
            project_name,
        )
    except ImportError as exc:
        logger.warning(
            "Tracing packages not installed — skipping tracing setup: %s", exc
        )
