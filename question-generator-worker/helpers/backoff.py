INFRA_BACKOFF_CAP_SECONDS = 30
JOB_BACKOFF_BASE_SECONDS = 60


def infra_backoff_seconds(attempt: int) -> int:
    """Backoff before retrying a failed receive_message call itself (Layer 1)."""
    return min(2 ** (attempt - 1), INFRA_BACKOFF_CAP_SECONDS)


def job_backoff_seconds(receive_count: int) -> int:
    """Visibility-timeout extension after a failed job attempt (Layer 2)."""
    return JOB_BACKOFF_BASE_SECONDS * (2 ** (receive_count - 1))


class InfraBackoffTracker:
    """Tracks consecutive receive_message() failures (Layer 1) so the poll
    loop can sleep with growing backoff instead of busy-looping, and reset
    once the transport recovers."""

    def __init__(self):
        self._consecutive_failures = 0

    def on_failure(self) -> int:
        self._consecutive_failures += 1
        return infra_backoff_seconds(self._consecutive_failures)

    def on_success(self) -> None:
        self._consecutive_failures = 0
