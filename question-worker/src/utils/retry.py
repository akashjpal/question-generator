from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from src.graph.errors import TransientJobError

# Layer 3 (tenacity, inside services — see plan section 8). Only
# TransientJobError is retried here; PermanentJobError and anything else
# propagates immediately. `reraise=True` means exhausting attempts re-raises
# the last TransientJobError rather than tenacity's own RetryError, so
# callers only ever need to catch our own exception types.
async_retry_transient = retry(
    retry=retry_if_exception_type(TransientJobError),
    stop=stop_after_attempt(3),
    wait=wait_exponential_jitter(initial=1, max=10),
    reraise=True,
)
