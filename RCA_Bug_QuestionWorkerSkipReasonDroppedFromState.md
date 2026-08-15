# RCA: question-worker never actually skips already-completed jobs

## Symptom

Discovered via `tests/test_graph.py::test_already_completed_job_skips_pipeline_entirely`
— previously invisible because the whole suite was hung on an unrelated
issue (`FakeSQSClient` event-loop starvation, fixed alongside this). Once
the hang was fixed, this test failed:

```
AssertionError: assert None == 'job already completed'
```

Captured log showed the graph ran `validate → fetch_pdf → extract → persist`
instead of stopping right after `validate`, and `extract` then failed
because no real PDF bytes exist in the test fixture — a knock-on failure
from the real bug, not the bug itself.

## Root cause

`src/models/state.py:8` declares `PipelineState` as a `TypedDict` — this is
what LangGraph uses to know which state keys to track and merge between
node calls. `validate.py:22-25` returns `{"skip_reason": f"job already
{row['status']}"}` for an already-completed job, and `build.py`'s
`_route_after_validate` checks `state.get("skip_reason")` to short-circuit
straight to `END`. But `skip_reason` was never declared as a field on
`PipelineState` — only `error` was (`state.py:38`). LangGraph silently drops
any key a node returns that isn't part of the declared schema, so
`skip_reason` never actually lands in state; the router always sees `None`
there and falls through to `"fetch_pdf"`.

## Evidence

Confirmed by the failing test's captured output showing `fetch_pdf`/`extract`
stages ran, and by comparing `state.py`'s field list against every key
`validate.py` returns — `skip_reason` is the only one missing.

## Blast radius

Every call site that relies on `validate`'s skip path: a redelivered SQS
message for a job that already finished (`validate.py:22-24`'s own comment:
"Redelivered message after a successful attempt whose SQS delete didn't
land — nothing to redo, nothing to persist again"). Without this fix, that
redelivery silently reprocesses the entire pipeline instead of skipping.
`persist`'s idempotent delete-then-insert (`db.py:157-180`) still keeps the
final DB result correct, so this was a wasted-compute/cost bug, not a
data-corruption one — but a real one, live in the pipeline until fixed.

## Fix

Added the missing field:

```python
# state.py
skip_reason: str | None
```

One line. No other code needed to change — `validate.py` and `build.py`
were already written correctly against the intended schema; the schema
itself was incomplete.

## To-do

- [x] Identify root cause (undeclared TypedDict field silently dropped by
      LangGraph's state merging)
- [x] Add `skip_reason: str | None` to `PipelineState`
- [x] Re-run full suite: 48/48 passed (user-verified)
