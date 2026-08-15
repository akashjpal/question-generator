# RCA: stale-in-progress threshold (180s) exceeds SQS visibility timeout (120s)

## Symptom

Found while diagnosing job 278's false-failure incident (see
`RCA_Bug_QuestionWorkerConcurrentDeliveryFalseFailure.md`, Bug 4). Not an
independently reported incident with its own traceback — a timing
inconsistency surfaced by auditing `validate.py`'s crash-recovery guard
against the SQS config it's meant to cooperate with.

Effect: after a worker process crashes mid-job (OOM, kill, any process-level
failure) while a job's `generation_jobs.status = "in_progress"`, recovery
takes longer than the 180s the code appears to intend. The first natural SQS
redelivery (~120s after the crash) still reads the row as "too fresh to be
abandoned," defers again, and recovery only happens on a *second*, later
redelivery — silently turning the intended ~180s wait into something longer
and undocumented.

## Root cause

- `question-worker/src/config.py:37` — `sqs_visibility_timeout: int = 120`
- `question-worker/src/config.py:39` — `visibility_heartbeat_interval: int = 60`
- `question-worker/src/graph/nodes/validate.py:12` —
  `_STALE_IN_PROGRESS_MULTIPLIER = 3`
- `question-worker/src/graph/nodes/validate.py:28-30` —
  `stale_after = services.settings.visibility_heartbeat_interval *
  _STALE_IN_PROGRESS_MULTIPLIER` → `60 * 3 = 180s`

`stale_after` (180s) is derived from a config value
(`visibility_heartbeat_interval`) that has nothing to do with SQS's actual
redelivery cadence — that cadence is governed by `sqs_visibility_timeout`
(120s). Because 180s > 120s, there's a window from 120s–180s after a crash
where:

1. SQS has already redelivered the message to a new worker (crash + the
   120s visibility timeout elapsed).
2. `validate.py:27-34` still classifies the row as fresh (`updated_at` is
   still <180s old), so it raises `TransientJobError` again and defers.
3. `sqs_consumer.py`'s backoff branch extends visibility further
   (`_JOB_BACKOFF_BASE_SECONDS * 2**(receive_count-1)`), pushing the *next*
   redelivery out even later before the row is finally judged stale and
   actually retried.

The two timers were tuned independently with no invariant enforced between
them (`stale_after < visibility_timeout`) — nothing in the code or config
prevents this ordering from being wrong, so a future change to either
setting alone can silently reintroduce or worsen the gap.

## Evidence

Code trace + arithmetic on the configured defaults (`config.py:37,39`,
`validate.py:12,28-30`); not independently reproduced against a live crash in
this session. The values themselves are unambiguous — 180 > 120 holds on
every run with default config, it isn't a timing-dependent race to
reproduce.

## Blast radius

- Only `validate.py`'s staleness check (`_parse_timestamp` + the
  `stale_after` comparison) consumes this derived value — no other node or
  service uses it for timing decisions.
- `visibility_heartbeat_interval` is *also* read by `sqs_consumer.py`'s
  `_heartbeat()` (`sqs_consumer.py:131-146`), but for a different, correct
  purpose — extending SQS's own message visibility while a job is actively
  running. That usage is unaffected by this bug; flagging only because it's
  easy to conflate the two consumers of the same setting. A fix here should
  not touch `_heartbeat()`.
- No frontend/API-side code reads these values — this is worker-internal
  only.
