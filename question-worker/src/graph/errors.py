class TransientJobError(Exception):
    """Retryable: infra hiccup (S3 error, LLM outage/rate-limit, DB timeout).
    Caught by the node's LangGraph RetryPolicy first; if attempts are
    exhausted it propagates out of the graph entirely so the consumer leaves
    the SQS message on the queue for redelivery — never delete, never mark
    the job failed, since a later attempt (this replica or another) might
    succeed cleanly."""


class PermanentJobError(Exception):
    """Not retryable: bad payload, corrupt/scanned PDF, document too short
    for the requested question count. Nodes raising this short-circuit the
    graph straight to `persist` with status=failed; the consumer deletes the
    SQS message afterwards — retrying can't fix a bad input."""

    def __init__(self, message: str, *, stage: str):
        super().__init__(message)
        self.stage = stage
