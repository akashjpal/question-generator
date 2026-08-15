# SQS Question-Generation Queue — Implementation Plan

Replace the current HTTP dispatch (`POST /generate-questions`) + in-memory
`asyncio.Queue` between `question-generator-api-ts` and
`question-generator-worker` with a real **Amazon SQS** queue running on
**ministack**, consumed by a standalone **boto3** receiver.

---

## 1. Decisions (confirmed with user)

| Question | Decision |
|---|---|
| Queue technology | AWS SQS on ministack (not RabbitMQ) |
| Client library | **boto3** (plain, no Celery/Dramatiq/Taskiq) |
| Architecture | Full replacement — worker no longer exposes an HTTP endpoint |
| Concurrency | Sequential — one job at a time (`MaxNumberOfMessages=1`) |
| Consumer shape | Standalone `consumer.py` script, **no FastAPI**, `restart: unless-stopped` |
| On job failure | **Do NOT delete the message.** Let SQS redeliver. |
| Retry policy | Exponential backoff, up to **3 total attempts**, then DLQ |
| DLQ | `question-generator-dlq` via `RedrivePolicy`, `maxReceiveCount=3` |
| Existing in-code retries | Kept as-is (tenacity in `question_generator.py`) |
| LangGraph rework | **Out of scope** — separate design later |

### Why not Celery / Dramatiq / Taskiq

All three are *task queues*: they encode "call Python function X with args Y"
in their own wire envelope, so the **producer must speak that envelope**. Our
producer is Bun/TypeScript, and no Node library speaks Celery-over-SQS
(`celery-node` / `celery-plus` support only RabbitMQ and Redis). FastStream —
the one framework with the right model (you define the payload) — does not
support SQS yet.

boto3 keeps the contract as **plain JSON we fully control on both sides**.

---

## 2. Verified against the real ministack (not assumed)

Probed live against the running `ministackorg/ministack` container:

| Capability | Result | Consequence for this design |
|---|---|---|
| create / send / receive / delete | ✅ works | baseline OK |
| **Long polling** (`WaitTimeSeconds`) | ✅ **real** — blocked 6s for a 5s wait | receiver blocks, does **not** busy-spin |
| `VisibilityTimeout` (queue-level) | ✅ enforced | safe to rely on |
| **`RedrivePolicy` → DLQ** | ✅ **enforced** — moved to DLQ after exactly `maxReceiveCount=3` | DLQ is real, not decorative |
| **`ChangeMessageVisibility`** | ✅ **works** — extended 5s→60s, still hidden at 8s | heartbeat + backoff-by-visibility both viable |
| `ApproximateReceiveCount` | ✅ returned, **only** via `AttributeNames=['All']` | must request `All`, not the specific name |

### Gotchas found

1. **`QueueUrl` is returned as `http://localhost:4566/...`** — unusable from
   inside another container. Must be rewritten to the `ministack` service host,
   or built from a configured base URL. **Do not use the URL SQS hands back verbatim.**
2. **Per-receive `--visibility-timeout` override appears ignored** by ministack;
   only the queue-level attribute and explicit `ChangeMessageVisibility` calls
   take effect.
3. **`question-generator` queue already exists** with `VisibilityTimeout=30`
   (far too short for an LLM job) and **no `RedrivePolicy` wired to the DLQ**.
   Both must be fixed. It also holds **4 stale test messages** to purge.
4. **`boto3` is not in `question-generator-worker/requirements.txt`** — must be added.

---

## 3. Blocking defect found: the pipeline is not idempotent

`helpers/question_generator.py:246` — `save_questions_to_db()` does a plain insert:

```python
result = supabase.table("ai-generated-questions").insert(rows).execute()
```

This was safe when a job ran exactly once. **It is no longer safe.** Under the
new policy a failed job is redelivered and re-run, so any job that fails *after*
questions were saved (e.g. the subsequent `update_job_status` call fails) will
**insert a duplicate set of questions** on the retry — up to 3× duplication.

**Fix (required, part of this work):** make the save idempotent by clearing that
job's rows first.

```python
def save_questions_to_db(questions: list[dict], job_id: str) -> list[dict]:
    if not questions:
        return []
    # Idempotency: a redelivered SQS message re-runs the whole pipeline,
    # so clear any rows from a previous attempt before inserting.
    supabase.table("ai-generated-questions").delete().eq("jobId", job_id).execute()
    rows = [...]
    result = supabase.table("ai-generated-questions").insert(rows).execute()
    return result.data
```

---

## 4. Architecture

```
question-generator-api-ts (Bun)                question-generator-worker (Python)
┌────────────────────────────┐                 ┌──────────────────────────────────┐
│ POST /generate-questions    │                │ consumer.py   (no FastAPI)       │
│  1. insert status row = 0   │  SendMessage   │                                  │
│  2. sqsClient.sendJob(job)  │ ─────────────► │ while not shutting_down:         │
│  3. return { jobId }        │  plain JSON    │   receive_message(               │
└────────────────────────────┘                 │     WaitTimeSeconds=20,          │
         (index.ts unchanged)                  │     MaxNumberOfMessages=1,       │
                                               │     AttributeNames=['All'])      │
   ministack SQS                               │   ├─ ok  → run_pipeline()        │
   ┌──────────────────────────────┐            │   │        └─ delete_message()   │
   │ question-generator            │            │   └─ fail→ NO delete            │
   │   VisibilityTimeout = 900     │            │            change_message_      │
   │   RedrivePolicy maxRecv = 3 ──┼──┐         │            visibility(backoff)  │
   │                               │  │         └──────────────────────────────────┘
   │ question-generator-dlq        │◄─┘            restart: unless-stopped
   └──────────────────────────────┘               → Docker owns crash recovery
        after 3rd failed receive
```

---

## 5. Message contract (plain JSON — unchanged shape)

The producer already builds this object; only the transport changes.

```jsonc
{
  "jobId":            "uuid-string",
  "fileId":           "s3-object-key",
  "fileName":         "lecture-notes.pdf",
  "topic":            "Photosynthesis",
  "difficultyLevel":  "medium",
  "numberOfQuestions": 10
}
```

Consumer validates required keys (`jobId`, `fileId`) before processing. A
message missing them is a **poison message** — see §7.

---

## 6. Retry, backoff and DLQ semantics

Two *independent* backoff layers. Do not conflate them.

### Layer 1 — infrastructure backoff (the receive call itself failed)

`receive_message()` throwing (ministack down, network blip) must **never kill the
loop**. Catch, sleep with exponential backoff, continue.

```
attempt 1 fail → sleep 1s
attempt 2 fail → sleep 2s
attempt 3 fail → sleep 4s   … capped at 30s
any success    → reset counter to 0
```

### Layer 2 — job backoff (the pipeline raised)

The message is **not deleted**. Instead its visibility is extended by an
exponentially growing delay, so SQS redelivers it later:

| Receive # | On failure | Next delivery |
|---|---|---|
| 1 | `ChangeMessageVisibility(60)` | after ~60s |
| 2 | `ChangeMessageVisibility(120)` | after ~120s |
| 3 | **final attempt** — set job status `3` (FAILED) | SQS moves it to **DLQ** |

`maxReceiveCount=3` means **3 total delivery attempts**, then the DLQ — verified
by live probe (receives #1/#2/#3 succeeded, #4 empty, DLQ depth 1). If you want
1 initial + 3 retries = 4 attempts, set `maxReceiveCount=4`.

**Job status rule:** only mark `STATUS_FAILED (3)` on the **final** attempt
(`ApproximateReceiveCount >= maxReceiveCount`). On earlier attempts leave the job
`PROCESSING (1)` — it is genuinely going to be retried. This matters because the
frontend polls until a terminal status; a job that silently dies in the DLQ
without a terminal status would make the UI poll forever.

### Heartbeat (prevents mid-job redelivery)

A long job must not have its message redelivered while it is still running — that
causes concurrent duplicate processing. While `run_pipeline` runs, a background
thread calls `ChangeMessageVisibility` every ~60s to keep extending the lease.
Verified working on ministack.

`VisibilityTimeout=900` (15 min) is the floor; the heartbeat covers anything longer.

---

## 7. Receiver design (`question-generator-worker/`)

New/changed files:

| File | Action | Purpose |
|---|---|---|
| `helpers/sqs_client.py` | **new** | boto3 SQS client factory + queue-URL resolution |
| `consumer.py` | **new** | the receive loop (entrypoint) |
| `helpers/question_generator.py` | edit | idempotent `save_questions_to_db` (§3) |
| `main.py` | **delete** | FastAPI app, `asyncio.Queue`, `_queue_worker`, HTTP route all go |
| `requirements.txt` | edit | add `boto3` |
| `Dockerfile` | edit | `CMD ["python", "consumer.py"]` instead of uvicorn; drop `EXPOSE 8000` |

### `helpers/sqs_client.py`

- Builds the client with `endpoint_url` from env so it targets ministack locally
  and real AWS in production with no code change.
- **Resolves the queue URL from a configured base + queue name**, rather than
  trusting the `localhost` URL SQS returns (gotcha §2.1).

```python
import os, boto3
from botocore.config import Config

def get_sqs_client():
    return boto3.client(
        "sqs",
        endpoint_url=os.getenv("AWS_ENDPOINT") or None,   # None → real AWS
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        config=Config(retries={"max_attempts": 3, "mode": "standard"}),
    )

def get_queue_url() -> str:
    return os.environ["SQS_QUEUE_URL"]   # explicit; never the returned localhost URL
```

### `consumer.py` — structure

```
main()
 ├── install SIGTERM/SIGINT handler → sets shutdown flag
 ├── wait_for_queue()          # retry until ministack answers (startup ordering)
 └── loop:
       if shutdown: break
       try:
           msgs = receive_message(WaitTimeSeconds=20, MaxNumberOfMessages=1,
                                  AttributeNames=['All'])
           reset infra backoff
       except Exception:
           infra backoff sleep; continue          # Layer 1 — loop never dies
       if no msgs: continue
       handle_message(msg)

handle_message(msg)
 ├── receive_count = int(msg['Attributes']['ApproximateReceiveCount'])
 ├── parse JSON  → invalid?  poison: log loudly, do NOT delete
 │                            (it will reach the DLQ after maxReceiveCount)
 ├── start heartbeat thread (extends visibility every 60s)
 ├── try:
 │      run_pipeline(...)          # UNCHANGED — existing helper
 │      delete_message()           # success is the ONLY delete path
 │   except Exception:
 │      if receive_count >= MAX_RECEIVE: update_job_status(job_id, 3)  # terminal
 │      else: change_message_visibility(backoff_for(receive_count))
 │      # deliberately NO delete → SQS redelivers → DLQ after 3
 └── finally: stop heartbeat
```

**Critical invariant:** `delete_message()` appears in exactly **one** place —
immediately after a successful `run_pipeline`. Every failure path leaves the
message on the queue.

### Graceful shutdown

`docker compose down` sends SIGTERM. The handler sets a flag; the loop exits
after the current job (or is killed at the grace period, in which case the
message simply redelivers — safe, because §3 made the pipeline idempotent).
Set `stop_grace_period: 30s` on the service.

---

## 8. Publisher changes (`question-generator-api-ts/`)

| File | Action |
|---|---|
| `package.json` | add `@aws-sdk/client-sqs` |
| `config/config.ts` | add `AWS_SQS_CONFIG` (queue URL) alongside existing `AWS_S3_CONFIG` |
| `helpers/sqsClient.ts` | **new** — mirrors the existing `s3Client.ts` pattern |
| `helpers/publisher.ts` | `publishToQuestionGenerationQueue()` — swap `fetch()` for `SendMessageCommand` |
| `index.ts` | **unchanged** — same method name and signature |

```ts
// helpers/sqsClient.ts
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { AWS_S3_CONFIG, AWS_SQS_CONFIG } from "../config/config";

export class sqsClient {
  private client = new SQSClient({
    region: AWS_S3_CONFIG.region,
    endpoint: AWS_S3_CONFIG.endpoint,   // ministack locally
    credentials: {
      accessKeyId: AWS_S3_CONFIG.accessKeyId,
      secretAccessKey: AWS_S3_CONFIG.secretAccessKey,
    },
  });

  async sendJob(job: unknown) {
    if (!AWS_SQS_CONFIG.queueUrl) throw new Error("SQS_QUEUE_URL is not set.");
    await this.client.send(new SendMessageCommand({
      QueueUrl: AWS_SQS_CONFIG.queueUrl,
      MessageBody: JSON.stringify(job),
    }));
  }
}
```

> Note: `docker-compose.yml`'s `question-generator-api` service currently passes
> **no `AWS_*` env vars at all**, even though `s3Client.ts` already reads them.
> Fix that in the same edit — it is the same env block.

---

## 9. Infrastructure

### `ministack/init/init-lambda.sh` — extend the existing watcher

Fold queue provisioning into the sidecar that already self-heals buckets/Lambda.
This sidesteps the question of whether ministack persists SQS across restarts —
provisioning is idempotent and re-applied whenever it is missing.

```sh
# --- SQS: main + DLQ, with redrive ---
aws $ENDPOINT sqs create-queue --queue-name question-generator-dlq 2>/dev/null || true
aws $ENDPOINT sqs create-queue --queue-name question-generator     2>/dev/null || true

DLQ_ARN=$(aws $ENDPOINT sqs get-queue-attributes \
  --queue-url $BASE/question-generator-dlq \
  --attribute-names QueueArn --query "Attributes.QueueArn" --output text)

aws $ENDPOINT sqs set-queue-attributes \
  --queue-url $BASE/question-generator \
  --attributes "{\"VisibilityTimeout\":\"900\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"
```

where `BASE=http://ministack:4566/000000000000`.

### `docker-compose.yml`

- `fastapi-worker` → rename intent to a queue consumer: drop `expose: 8000`,
  add `stop_grace_period: 30s`, `depends_on: ministack (healthy)`.
- Add `AWS_*` + `SQS_QUEUE_URL` to **both** the worker and the API service.

### Env vars (`.env.example` + `.env`)

```
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=us-east-1
AWS_ENDPOINT=http://ministack:4566
SQS_QUEUE_URL=http://ministack:4566/000000000000/question-generator
```

---

## 10. Implementation steps (in order)

1. **Purge the 4 stale test messages** from `question-generator` — otherwise they
   are consumed the moment the receiver starts.
2. `ministack/init/init-lambda.sh` — add queue + DLQ + redrive provisioning; restart
   `ministack-init`; verify attributes read back.
3. `question-generator-worker/requirements.txt` — add `boto3`.
4. `helpers/question_generator.py` — make `save_questions_to_db` idempotent (§3).
5. `helpers/sqs_client.py` — new client factory.
6. `consumer.py` — new receive loop (§7).
7. Delete `main.py`; update `Dockerfile` (`CMD`, drop `EXPOSE`).
8. `question-generator-api-ts` — add `@aws-sdk/client-sqs`, `config.ts`,
   `helpers/sqsClient.ts`, rewrite `publishToQuestionGenerationQueue`.
9. `docker-compose.yml` + `.env.example` — env vars, `stop_grace_period`, drop `expose`.
10. Validation (§11).
11. Write `sqs_question_queue_walkthrough.md`.

---

## 11. Validation

| # | Test | Expected |
|---|---|---|
| 1 | `sqs get-queue-attributes` on both queues | `VisibilityTimeout=900`, `RedrivePolicy` present |
| 2 | `aws sqs send-message` by hand | consumer logs pickup within ~20s |
| 3 | Full E2E: upload PDF → generate | job reaches status `2`, questions saved once |
| 4 | **Idempotency**: force a post-save failure | retry does **not** duplicate questions |
| 5 | **Backoff**: make `run_pipeline` raise | message not deleted; visibility extended; redelivered |
| 6 | **DLQ**: keep it failing | after 3 attempts message lands in `question-generator-dlq`, job status `3` |
| 7 | **Crash**: `docker kill` mid-job | message redelivers after visibility expiry; no duplicate questions |
| 8 | **Heartbeat**: job longer than 900s | message stays invisible; no concurrent second run |
| 9 | **Infra backoff**: stop ministack while consumer runs | consumer logs backoff, does not exit; recovers when ministack returns |

---

## 12. Out of scope

- LangGraph rework of the worker (separate design).
- Retiring `file-scanner-worker` + `publisher.publish()`/`scan_queue` (dead since
  the Lambda AV scanner replaced it) — cleanup, tracked separately.
- Leftover `my-queue` / `deadletter-queue` on ministack.
- Supabase → ministack DB migration (`roadmap.txt`).
