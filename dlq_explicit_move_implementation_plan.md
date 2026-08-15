# Explicit Dead-Letter-Queue Move — Implementation Plan

## Problem

Today, when a job exhausts its retries (`receive_count >= max_receive_count`),
`helpers/receiver.py` does nothing to the message — it just marks the job
`STATUS_FAILED` in the DB and returns. The message is still sitting on the
main queue with its last visibility timeout (900s). It only reaches the DLQ
once that timeout expires and SQS attempts a 4th delivery, notices
`ApproximateReceiveCount` now exceeds the queue's `RedrivePolicy.maxReceiveCount`,
and reroutes it automatically.

That's correct, but slow: up to 15 minutes of dead time between "we gave up"
and the message actually being quarantined in the DLQ.

## Decision

Move the message to the DLQ **explicitly and immediately** on the final
failure, instead of waiting on SQS's own redrive:

1. `sqs.send_message(QueueUrl=dlq_url, MessageBody=<original body>)`
2. `sqs.delete_message(QueueUrl=main_queue_url, ReceiptHandle=...)` — only
   after step 1 succeeds
3. `update_job_status(job_id, STATUS_FAILED)`

If step 1 (`send_message` to the DLQ) itself fails, we do **not** delete from
the main queue — the message is left exactly as today, and the existing
`RedrivePolicy` remains as an automatic fallback. So this is additive: the
explicit path is the fast, normal case; the automatic redrive is now a safety
net for the rare case where even the DLQ send fails.

This is the one place `delete_message` is called outside the success path —
worth calling out since "never delete on failure" was the original hard
requirement. The distinction: this delete only happens *after* the message
has been durably copied to the DLQ, so no data is lost — the message is
moved, not discarded. A bare delete-without-DLQ-send remains forbidden.

## Changes

**`helpers/sqs_client.py`**
- Add `get_dead_letter_queue_url()`, mirroring `get_queue_url()` — reads
  `SQS_DEAD_LETTER_QUEUE_URL` from env, raises if unset.

**`helpers/receiver.py`**
- `handle_message` gains a `dlq_queue_url: str` parameter.
- Final-failure branch becomes: `send_message` to DLQ → `delete_message` on
  main queue → `update_job_status`. Wrapped so a DLQ-send failure logs and
  falls through to today's do-nothing-and-wait behavior instead of raising.

**`consumer.py`**
- Resolve `dlq_queue_url = get_dead_letter_queue_url()` once at startup
  (fail fast if misconfigured, same pattern as `get_queue_url()`).
- Pass it through to `handle_message`.

**Env / config**
- `question-generator-worker/.env` — add `SQS_DEAD_LETTER_QUEUE_URL=http://localhost:4566/000000000000/question-generator-dlq`
- `docker-compose.yml` (`fastapi-worker` service) — add
  `SQS_DEAD_LETTER_QUEUE_URL=${SQS_DEAD_LETTER_QUEUE_URL:-http://ministack:4566/000000000000/question-generator-dlq}`

No change to `ministack/init/init-lambda.sh` — the DLQ and `RedrivePolicy`
already exist; this doesn't replace them, it just races ahead of them in the
normal case.

## Testing (TDD, extends `tests/test_receiver.py`)

- `FakeSqs` gains `send_message` (records `(QueueUrl, MessageBody)`).
- Update `test_handle_message_failure_at_max_marks_failed_and_does_not_delete`
  → rename/rewrite to assert the new behavior: `send_message` called with the
  DLQ URL and the original body, `delete_message` called on the main queue,
  status set to `STATUS_FAILED`.
- New test: DLQ `send_message` raises → main-queue message is *not* deleted,
  no unhandled exception propagates out of `handle_message` (consumer loop
  must survive).

## Out of scope

- Any change to the below-max-retries backoff path (untouched).
- Any change to how the DLQ itself is provisioned or its `RedrivePolicy`.
- Consuming/inspecting the DLQ (still just a parking lot for now).
