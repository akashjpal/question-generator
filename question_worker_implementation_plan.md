# Question Worker — Implementation Plan

Adapts the supplied `# Question Generator Worker — Implementation Plan` to this repo's real, already-live infrastructure. This is a **full replacement** of `question-generator-worker/`: new `question-worker/` service, async end-to-end, single LangGraph state machine for the whole pipeline (not just generate↔judge), wired to the *same* SQS queue/S3 bucket/LLM provider so nothing upstream (Node API, frontend) needs to change.

## Decisions locked in (via user Q&A)

1. **Full replacement.** `question-worker/` becomes the one consumer on the `question-generator` SQS queue. `docker-compose.yml`'s `fastapi-worker` service is repointed at `./question-worker`. `question-generator-worker/` is left on disk (git-tracked, nothing deleted) but removed from compose — no two processes ever compete for the same message.
2. **New `generation_jobs` + `generation_job_rejected_questions` tables**, richer status model (stage, progress_meta, rejection reasons) as the plan specifies.
3. **Dual-write for compatibility.** The Node API's polling endpoint and the frontend read `ai-generated-question-status` (status int 0-3) and `ai-generated-questions` directly — that's out of scope for this task. So `persist`/`status` write **both**: the new `generation_jobs` row (rich, source of truth for this worker) *and* the existing two tables (so nothing else in the system breaks or needs a synchronized deploy).

## Reused contracts (must not change — other live services depend on them)

| Contract | Value | Source |
|---|---|---|
| SQS queue URL | `SQS_QUEUE_URL` env, ministack default `http://ministack:4566/000000000000/question-generator` | `docker-compose.yml`, `question-generator-api-ts/helpers/sqsClient.ts` |
| DLQ | `question-generator-dlq`, RedrivePolicy `maxReceiveCount=3` (ministack init script) — worker never deletes on transient failure, SQS redrive handles DLQ routing | `ministack/init/init-lambda.sh` |
| SQS message body | `{ jobId, fileId, fileName?, noOfQuestion, difficulty, topic? }` (camelCase — published as-is by `question-generator-api-ts/index.ts`) | `question-generator-api-ts/index.ts` POST /generate-questions |
| S3 bucket | `AWS_BUCKET_CORRECT` (default `correct-files`); object key = `fileId` verbatim | `question-generator-worker/helpers/file_downloader.py` |
| AWS client config | `AWS_ENDPOINT` unset → real AWS; set → ministack. Path-style S3 addressing. `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION` | `s3_client.py`, `sqs_client.py` |
| LLM provider | OpenRouter (OpenAI-compatible), not Groq despite stale `CLAUDE.md` text. `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (default `moonshotai/kimi-k2`), base URL `https://openrouter.ai/api/v1` | `qgen_graph/graph.py` |
| Embeddings | `OPENROUTER_EMBEDDING_MODEL` (default `openai/text-embedding-3-small`) via the same OpenRouter-compatible client | `helpers/chunking.py` |
| DB access | Supabase (REST via service-role key), **not** a raw Postgres connection string — no Python service has `DATABASE_CONNECTION_STRING` credentials, only the .NET APIs do | `helpers/supabase_client.py`, `.env.example` |
| Job status enum (existing table) | `0`=Queued, `1`=Processing, `2`=Completed, `3`=Failed | `CLAUDE.md`, `pipeline.py` |
| `ai-generated-questions` row shape | `{jobId, question_text, options: string[4], correct_options: "A"-"D", explanation}` | `question_generator.save_questions_to_db` |

## Deviations from the original plan, and why

- **`aioboto3` for S3 + SQS**, keeping the exact same endpoint/credential/path-style logic as the sync clients above (just async).
- **DB layer uses the Supabase **async** client (`supabase.create_async_client`)**, not `asyncpg`/SQLAlchemy — the plan's assumption of a raw Postgres connection string doesn't hold for this repo; Supabase's service-role REST access is the only DB credential Python code has.
- **`job_id` columns are `text`, not `uuid`.** The existing `ai-generated-question-status.id` PK type isn't visible from code (Supabase-managed, no migration files in-repo) — `text` is compatible whether it's a UUID or something else, and avoids a cast failure blocking every insert.
- **Generate/judge nodes use prompted-JSON + Pydantic validation, not LangChain `.with_structured_output` (tool-calling).** The current model (`moonshotai/kimi-k2` via OpenRouter) is already proven with prompted-JSON in the existing `qgen_graph` code; switching to tool-calling structured output risks silent failures if OpenRouter's tool-calling support for this model is inconsistent. Validation failures are still hard errors (Pydantic), not swallowed — that's what makes this "not a cheap alternative": every parse is schema-checked and retried via the node's retry policy, just without betting the whole pipeline on tool-calling support we haven't verified.
- **Chunking uses `langchain-text-splitters`' `RecursiveCharacterTextSplitter`** (added dependency) instead of the existing hand-rolled char-window splitter — matches the plan's explicit ask and is more correct at sentence/paragraph boundaries.
- **`MAX_RECEIVE_COUNT` default is 3**, matching the live ministack redrive policy (plan's example said 4).

## Project structure

```
question-worker/
├── requirements.txt
├── Dockerfile
├── .env.example
├── src/
│   ├── main.py                       # entrypoint: signal handling + consumer start
│   ├── config.py                     # pydantic-settings, all env vars
│   ├── consumer/
│   │   ├── sqs_consumer.py           # async poll loop, semaphore concurrency, heartbeat, ack/nack
│   │   └── dispatcher.py             # parse SQS message -> JobPayload -> run graph
│   ├── models/
│   │   ├── job.py                    # JobPayload (aliases match Node publisher's camelCase)
│   │   ├── state.py                  # PipelineState (LangGraph state schema)
│   │   └── outputs.py                # GeneratedQuestion, JudgeVerdict, RejectedQuestion
│   ├── graph/
│   │   ├── errors.py                 # PermanentJobError / TransientJobError
│   │   ├── build.py                  # build_graph() — nodes + edges + retry policies
│   │   └── nodes/
│   │       ├── validate.py           # payload + idempotency (generation_jobs upsert)
│   │       ├── fetch_pdf.py          # S3 get_object, tenacity retry
│   │       ├── extract.py            # PyMuPDF text extraction + scanned/too-short detection
│   │       ├── chunk_embed.py        # RecursiveCharacterTextSplitter + batch embeddings
│   │       ├── select_chunks.py      # topic similarity OR no-topic spread selection
│   │       ├── generate.py           # question generation, prompted JSON + Pydantic validation
│   │       ├── dedupe.py             # embedding cosine-similarity near-duplicate filter
│   │       ├── judge.py              # LLM-as-judge, structured verdicts incl. reason
│   │       └── persist.py            # dual-write: generation_jobs (+rejected) AND legacy tables
│   ├── services/
│   │   ├── llm.py                    # generator + judge chat clients
│   │   ├── embeddings.py             # embeddings client (async)
│   │   ├── storage.py                # S3 download (aioboto3, tenacity)
│   │   ├── db.py                     # Supabase async client wrapper, all table access
│   │   └── status.py                 # update_status(job_id, stage, meta) helper
│   └── utils/
│       ├── logging.py                # structlog JSON logging, job_id bound
│       └── retry.py                  # shared tenacity policies
├── migrations/
│   └── 001_generation_jobs.sql       # NOT applied automatically — see rollout notes
└── tests/
    ├── conftest.py                   # shared fixtures: fake LLM, fake embeddings, in-memory PDF factory
    ├── test_nodes/                   # one file per node, mocked services
    ├── test_graph.py                 # graph-level: full-accept / partial-regen / rounds-exhausted
    └── test_consumer.py              # ack/nack/heartbeat/shutdown, mocked aioboto3
```

## Pipeline (single LangGraph state machine)

```
validate → fetch_pdf → extract → chunk_embed → select_chunks → generate → dedupe → judge ─┬→ persist → END
                                                                     ▲                      │
                                                                     └── needed>0 and round<MAX ┘
```

Every node's first action updates `generation_jobs.stage`. `PermanentJobError` short-circuits straight to `persist` with a `failed` status; `TransientJobError` is retried by the node's LangGraph `RetryPolicy`, and if attempts are exhausted, propagates out of the graph so the consumer leaves the SQS message for redelivery (no delete, no `failed` write — a different worker replica or a later attempt should get a clean shot).

## DB schema (new)

```sql
create table if not exists generation_jobs (
  job_id text primary key,
  status text not null default 'queued'
    check (status in ('queued','in_progress','completed','completed_partial','failed')),
  stage text,
  progress_meta jsonb not null default '{}'::jsonb,
  error_reason text,
  attempt_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists generation_job_rejected_questions (
  id bigserial primary key,
  job_id text not null references generation_jobs(job_id) on delete cascade,
  round int not null,
  question_text text not null,
  reason text not null,
  source text not null check (source in ('judge','dedupe')),
  created_at timestamptz not null default now()
);
create index if not exists idx_rejected_job_id on generation_job_rejected_questions(job_id);
```

`migrations/001_generation_jobs.sql` will contain this. **Not applied to live Supabase automatically** — schema changes to a shared/production database are a confirm-first action; the file is handed to the user to run (Supabase SQL editor or `supabase db execute`) before the new worker's first deploy.

## Rollout notes

1. New tables must exist before `question-worker` runs its first job (idempotency/status writes hit `generation_jobs` immediately in `validate`).
2. `docker-compose.yml`'s `fastapi-worker` service `build:` path flips from `./question-generator-worker` to `./question-worker`; env block gains `SQS_DLQ_URL`, `WORKER_CONCURRENCY`, `SQS_MAX_MESSAGES`, `SQS_WAIT_TIME`, `SQS_VISIBILITY_TIMEOUT`, `VISIBILITY_HEARTBEAT_INTERVAL`, `MAX_REGENERATION_ROUNDS`, `DUPLICATE_SIMILARITY_THRESHOLD`, `MIN_EXTRACTED_CHARS`, `MIN_CHARS_PER_QUESTION`, `JUDGE_MODEL`, `EMBEDDING_MODEL`.
3. `question-generator-worker/` stays in the repo, untouched, no longer referenced by compose — reversible by editing compose back if the new worker regresses something.

## Implementation order

1. Scaffold (`requirements.txt`, `Dockerfile`, `.env.example`, package tree, `config.py`, models).
2. Services (`storage.py`, `db.py`, `llm.py`, `embeddings.py`, `status.py`).
3. Graph nodes, each independently testable with mocked services.
4. `graph/build.py` — wiring, conditional edge, per-node retry policies.
5. Consumer (`sqs_consumer.py`, `dispatcher.py`) + `main.py`.
6. `utils/logging.py`, `utils/retry.py`.
7. Tests: per-node, graph-level, consumer-level.
8. `migrations/001_generation_jobs.sql`.
9. `docker-compose.yml` cutover.
10. Run full suite, verify green.
11. `question_worker_walkthrough.md`.
