# SQS Question-Generation Queue — Walkthrough

## What changed, in plain terms

Before: the Node API called the Python worker directly over HTTP
(`POST /generate-questions`), and the worker buffered jobs in memory
(`asyncio.Queue`). If the worker restarted, every buffered job was gone —
no trace, no retry, nothing.

After: the Node API drops a job onto a real **SQS queue** (running on
ministack, your local AWS emulator). The Python worker no longer has an
HTTP endpoint at all — it's just a script that sits there asking SQS
"anything for me?" in a loop. If it crashes mid-job, the message doesn't
vanish — SQS notices the worker went quiet and hands the same message to
whoever asks next.

```
BEFORE                                   AFTER

Node API --HTTP POST--> Python worker    Node API --SendMessage--> SQS queue
                |                                                     |
          asyncio.Queue                                          Python worker
          (RAM only,                                             (long-polls,
           gone on restart)                                       no HTTP at all)
```

## The three failure questions this design answers

Your original worry was: *"if the receiver breaks, does it just die quietly?"*
Three things had to be true for the answer to be no.

### 1. What if the job itself fails? (bad PDF, LLM error, etc.)

The message is **never deleted** on failure. It stays on the queue, and SQS
will hand it back to the worker again after a wait — the wait doubles each
time (60s → 120s → 240s...) so a struggling dependency gets breathing room
instead of being hammered.

```
Job fails →  don't delete  →  extend the "hide" timer  →  SQS gives it
                                                            back later
```

After 3 total attempts, SQS stops giving it to the worker and moves it to a
separate **dead-letter queue** instead — a parking lot for jobs that
genuinely can't succeed, so you can look at them later without them clogging
the real queue forever.

```
attempt 1 fails → wait ~60s  ─┐
attempt 2 fails → wait ~120s ─┼─→ attempt 3 fails → job marked FAILED,
attempt 3 fails → ─────────────┘   message ages out → moved to DLQ
```

### 2. What if the connection to SQS itself breaks? (network blip, ministack restart)

This is different from "the job failed" — this is "I couldn't even ask the
question." The loop catches that separately and backs off on its own
(1s → 2s → 4s... capped at 30s), then just keeps trying. It never crashes
the whole process over a transient blip.

### 3. What if a job takes a long time — could it get redelivered while still running?

Yes, that's a real risk with any queue: if a job runs longer than SQS's
"assume this is stuck" timer, SQS thinks the worker died and hands the same
job to someone else — now you're processing it twice. The fix is a
**heartbeat**: a background thread taps SQS every 60 seconds while the job
is running, saying "still here, still working" — so the message stays
hidden for as long as the job actually takes.

```
job starts ──────────────────────────────────────► job finishes
   │        heartbeat        heartbeat
   │        (60s: "still     (60s: "still
   │         here")           here")
   └─ message stays invisible the whole time, even past the base 15-minute timer
```

## Why not a fancier framework? (Celery, Dramatiq, etc.)

We looked at this properly before writing code — see
`sqs_question_queue_implementation_plan.md` §1 for the full reasoning.
Short version: those frameworks want the *producer* to speak their own
message format too, and our producer is TypeScript while the framework
ecosystem is Python-only. Using one would've meant hand-encoding a
Python-specific wire format in TypeScript with no library to help — exactly
the kind of fragile thing you were trying to avoid. Plain JSON, read the
same way on both ends, turned out to be the actually-simpler answer.

## Map of what got built

```
question-generator-api-ts/
  helpers/sqsClient.ts        ← talks to SQS (send a job)
  helpers/publisher.ts        ← publishToQuestionGenerationQueue() now
                                 calls sqsClient instead of fetch()

question-generator-worker/
  consumer.py                 ← the entrypoint — the actual "while true, ask SQS" loop
  helpers/
    sqs_client.py              ← boto3 setup (talks to ministack or real AWS)
    receiver.py                ← the decision logic: success → delete,
                                  failure → don't delete + backoff,
                                  final failure → mark FAILED
    backoff.py                  ← the two backoff calculations (connection
                                  retries vs. job retries)
    heartbeat.py                 ← the "still working" background thread
    pipeline.py                  ← your existing question-generation logic,
                                  moved here unchanged (download → extract →
                                  ask the LLM → save → mark complete)
  tests/                        ← 17 tests, one for each behavior above
```

`main.py` is gone — there's no HTTP server in the worker anymore, just
`consumer.py` running as a plain script.

## One bug this surfaced and fixed

Retrying a failed job means it might run its "save to database" step more
than once. The original code just inserted new rows every time — so a job
that failed *after* saving would duplicate its own questions on every retry.
Fixed by clearing that job's previous rows before saving again, so a retry
always ends up with exactly one set of questions, however many times it ran.

## How this was verified

- **17 automated tests** (TDD — each one written failing first, then made to
  pass) covering every behavior above with fake SQS clients, so they run in
  milliseconds with no real AWS/network calls.
- **Live-tested against your real ministack**, not just assumed to work:
  confirmed long-polling genuinely blocks, `RedrivePolicy` genuinely moves
  messages to the DLQ after 3 receives, and `ChangeMessageVisibility`
  (the heartbeat mechanism) genuinely extends the hidden window.
- **Built and ran the real worker container** against the live queue, sent
  it a real message, and watched it hit a real Supabase 404 and correctly
  leave the message on the queue instead of deleting it.
- **Killed ministack outright** (config change forced a container recreate)
  and watched the existing self-healing watcher (`ministack-init`)
  automatically recreate the queue, redrive policy, and Lambda within ~10
  seconds — no manual steps.

## What's not yet done

- A full end-to-end run (real PDF upload → questions actually generated) —
  needs the whole stack up with a real file, not exercised this session.
- Letting a job fail all the way through the ~18-minute real-time retry
  cycle to watch it land in the DLQ live (the DLQ mechanism itself and the
  retry-counting logic are both already verified separately — this would
  just be watching them run back-to-back for real).
- Killing the worker container mid-job to watch redelivery happen for real.

These are listed as open checkboxes in `todo.md` under Phase 5 — worth
doing once you're ready to poke at it yourself, since that's the whole
point of building this hands-on.
