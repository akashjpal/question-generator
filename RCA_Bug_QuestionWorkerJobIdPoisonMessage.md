# RCA: question-worker treats every real job as a poison message

## Symptom

Running `question-worker` standalone against the live SQS queue, every real
job submitted via the frontend fails immediately:

```
poison message, leaving on queue body='{"fileName":"SQL (notes).pdf","fileId":"...","noOfQuestion":5,"difficulty":"easy","topic":"","jobId":264}'
```

Three different real submissions (jobId 264, 265, 266) all failed the same
way — this is not one message being retried, it's a 100% failure rate on
real traffic.

## Root cause

1. `question-generator-api-ts/helpers/publisher.ts:35-50` —
   `updateQuestionGenerationStatus()` inserts into
   `ai-generated-question-status` and returns `data.id` — the table's
   Postgres-generated primary key, which is **numeric**, not a UUID/text.
2. `question-generator-api-ts/index.ts:68-77` puts that numeric `jobId`
   straight into the SQS message body with no `.toString()`. The wire JSON
   is `"jobId":264` — a JSON number.
3. `question-worker/src/models/job.py:16` declares
   `job_id: str = Field(alias="jobId")`. Pydantic v2's default ("lax")
   validation mode does **not** coerce `int` → `str` for a `str`-typed field
   (this is a behavior change from Pydantic v1, which stringified almost
   anything). Validating `{"jobId": 264, ...}` raises `ValidationError`.
4. `dispatcher.py:36-39` (`parse_job_payload`) catches that
   `ValidationError` and raises `PoisonMessageError`.
5. `sqs_consumer.py:105-106` catches `PoisonMessageError` and only logs —
   it does not delete the message, so it sits on the queue and is
   redelivered every visibility timeout until `maxReceiveCount` is hit and
   it drains to the DLQ.

The `001_generation_jobs.sql` migration comment speculated the legacy id
"isn't visible from application code... text is compatible with either a
uuid or some other generated id" and chose `job_id text` defensively. That
guess was directionally fine for storage (text safely holds `"264"`), but
`JobPayload.job_id`'s Pydantic type wasn't given the same defensive
treatment — it assumes the wire value already arrives as a string.

## Fix

Add a `mode="before"` validator on `JobPayload.job_id` that stringifies
numeric input, mirroring the existing `difficulty`/`topic` normalizers
already in the same file (`job.py:24-34`) — the file already has the
pattern for "be lenient about what the real publisher actually sends."

Do not change the publisher (`question-generator-api-ts`) — the id is a
legitimate Postgres numeric PK; the consumer should tolerate it.

## Out of scope / flagged, not fixed

`sqs_consumer.py`'s poison-message handling leaves the message on the queue
rather than deleting it, which contradicts `PoisonMessageError`'s own
docstring ("Left on the queue... same policy as every other unretriable
failure") in spirit but not in current code — a malformed message loops for
`maxReceiveCount` redeliveries before reaching the DLQ instead of being
evicted immediately. This may be intentional (redrive+DLQ is still a valid
safety net) — flagging for a decision, not changing without confirmation.

## To-do

- [x] Identify root cause (Pydantic v2 no longer coerces int → str)
- [x] Confirm real payload shape from `question-generator-api-ts` (numeric id, unstringified)
- [x] Add `field_validator(mode="before")` on `JobPayload.job_id` to stringify int/float input
- [ ] Re-run standalone worker against the same queue and confirm the stuck messages (264/265/266) now process
- [ ] Decide (separate, not blocking): should poison messages be deleted immediately instead of left for redrive?
