import logging
import sys

import structlog


def configure_logging() -> None:
    """JSON structured logs. Call once at process startup (main.py)."""
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=logging.INFO)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(**initial_context):
    return structlog.get_logger().bind(**initial_context)


def bind_job_id(job_id: str) -> None:
    """Bind job_id into contextvars so every log line emitted anywhere during
    this job's processing carries it, without threading a logger object
    through every function call."""
    structlog.contextvars.bind_contextvars(job_id=job_id)


def clear_job_context() -> None:
    structlog.contextvars.clear_contextvars()
