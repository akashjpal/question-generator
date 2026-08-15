# RCA: question-worker marks a still-in-progress job as "failed" when two deliveries race

## Symptom

```
JobProcessingError: job 278 already in_progress and recently updated —
leaving message for SQS visibility timeout to arbitrate

HTTP Request: PATCH .../generation_jobs?job_id=eq.278 "HTTP/2 200 OK"
HTTP Request: PATCH .../ai-generated-question-status?id=eq.278 "HTTP/2 200 OK"
```

`ApproximateReceiveCount=3` for this delivery. The message was never actually
processed to completion or genuine failure — validate's own concurrency guard
tripped — yet job 278 was written to the DB as `status="failed"` in both the
new (`generation_jobs`) and legacy (`ai-generated-question-status`) tables.

## Root cause chain (3 bugs, 1 likely trigger)

### Trigger (unconfirmed) — two deliveries of job 278 ran concurrently

`validate.py:27-34`'s guard only fires when `row["status"] == "in_progress"`
*and* `updated_at` is recent (within `stale_after =
visibility_heartbeat_interval * 3` = 180s, `config.py:38-39`). That state only
exists if some other attempt already claimed the row — i.e. SQS handed out
the same message to two workers at once. That requires attempt A's visibility
timeout (120s, `config.py:37`) to lapse while A was still genuinely running,
which requires the heartbeat (`sqs_consumer.py:131-146`, fires every 60s) to
have missed its window. A 60s margin should normally be safe; it only
evaporates if something in the graph (fetch_pdf, extract/PyMuPDF, chunk_embed,
the LLM call) blocks the event loop long enough to delay
`asyncio.wait_for(stop_event.wait(), timeout=interval)` from firing on time.
Not provable from the traceback alone — needs instrumentation to confirm.

### Bug 1 — `validate`'s node-level RetryPolicy defeats its own guard's intent

`graph/build.py:71` attaches `RetryPolicy(max_attempts=3,
retry_on=TransientJobError)` to the `validate` node, same as every other node.
But `validate.py:31-34` raises `TransientJobError` specifically to mean "back
off and let *SQS's* visibility timeout arbitrate" — its own message says so.
LangGraph's node-level retry has no awareness of that intent: it retries
`validate` up to 3 times in-process, back-to-back, within milliseconds, all
inside this single SQS delivery. The condition being waited on (the other
attempt finishing, or its row going stale) cannot resolve that fast, so all 3
internal retries fail identically and the error escapes `graph.ainvoke()` —
burning this delivery's outcome instantly instead of genuinely deferring to
SQS redelivery as intended.

### Bug 2 — the consumer can't distinguish "still legitimately in progress" from "really failed"

`sqs_consumer.py:107-116` decides finality purely from `receive_count >=
sqs_max_receive_count` (here, 3 >= 3), with no distinction between a
`JobProcessingError` caused by validate's in-progress guard and one caused by
an actual pipeline failure (bad PDF, LLM error, etc.). Because this happened
to land on the 3rd SQS delivery, the consumer treated the in-progress guard's
`TransientJobError` as the final, unrecoverable failure and called
`set_final_status(278, "failed", ...)` — the two `PATCH` calls visible right
after the traceback. Job 278 is now marked failed in both tables even though
nothing about its generation pipeline actually failed — another attempt may
still be mid-run, or may already have completed successfully and could
race/overwrite this incorrect write.

### Bug 3 (consequence, not an independent cause) — no reconciliation after the false failure

This branch (`sqs_consumer.py:113-116`) doesn't delete the message or extend
its visibility, so it silently rides out the remaining visibility window and
reaches SQS's own DLQ redrive on a 4th delivery (`maxReceiveCount=3` on the
queue's `RedrivePolicy`) — arriving in the DLQ *after* the DB already says
"failed," with nothing tying the two together or correcting the status.

### Bug 4 — `stale_after` (180s) is longer than `visibility_timeout` (120s)

`validate.py:12`'s `_STALE_IN_PROGRESS_MULTIPLIER = 3` × `visibility_heartbeat_interval`
(60s) = 180s. But SQS's own `visibility_timeout` is only 120s (`config.py:37`).
After a crashed worker, the first natural redelivery arrives at ~120s — before
the row is considered stale (180s) — so the new worker hits the in-progress
guard *again*, backs off further, and only retries after an extra wasted
round-trip. Net real-world wait ends up noticeably longer than either number
alone suggests. `stale_after` should be *below* `visibility_timeout`, not
above it.

## Fix (proposed, not yet applied — confirm before implementing)

1. Remove `retry_policy` from the `validate` node specifically (or set
   `max_attempts=1` for it) — its in-progress guard is meant to defer to
   SQS-level redelivery, not LangGraph's in-node retry. Other nodes keep
   their existing `retry_policy`.
2. Give the in-progress guard's error a way to signal "this is a concurrency
   guard, not a pipeline failure" (distinct exception type, or a flag on
   `TransientJobError`) so `_handle_message`'s final-attempt branch never
   calls `set_final_status("failed", ...)` for it — it should always fall
   through to backoff/extend-visibility, or on true exhaustion leave the
   message for SQS's own redrive without writing a false terminal status.
3. Confirm the trigger: instrument (or code-read) `fetch_pdf` / `extract` /
   `chunk_embed` / `generate` for any blocking/synchronous call that could
   delay the heartbeat past `sqs_visibility_timeout`, to fix the root
   precondition and not just its symptom.
4. Set `stale_after` to a value below `sqs_visibility_timeout` instead of
   above it — e.g. `100s` (≈20s margin under the 120s ceiling, still
   tolerant of a single slow node like `generate`'s uncapped LLM call).
   Simplest form: replace the `_STALE_IN_PROGRESS_MULTIPLIER` calculation
   with a direct `stale_after` setting, or add an explicit
   `min(heartbeat_interval * 3, visibility_timeout - 20)` guard so the two
   configs can't drift apart again if either is tuned later.

## Out of scope / flagged, not fixed

- Whether a job stuck oscillating between "in_progress" (stale-check not yet
  triggered) and this false-failure path should have a separate reconciliation
  job — not addressed here, needs a decision.

## To-do

- [ ] Confirm which node call (if any) blocks the event loop long enough to
      delay the heartbeat past `sqs_visibility_timeout`
- [ ] Remove/adjust `validate` node's `RetryPolicy` so its in-progress guard
      doesn't self-retry within a single delivery
- [ ] Distinguish "still in progress" `TransientJobError` from a genuine
      pipeline failure in `_handle_message`'s final-attempt branch
- [ ] Decide: on genuine exhaustion of retries for an in-progress guard,
      should the job stay `in_progress` (stuck, needs a sweeper) or something
      else?
- [ ] Re-test: force two concurrent deliveries of one `job_id`, confirm no
      false `"failed"` status is written
- [ ] Set `stale_after` below `sqs_visibility_timeout` (e.g. 100s vs 120s)
      instead of above it (currently 180s vs 120s), so a crashed worker's job
      is picked back up on the first natural redelivery instead of an extra
      wasted round-trip
