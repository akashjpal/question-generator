# Question Worker Rewrite — TODO

Plan: `question_worker_implementation_plan.md`

Full async rewrite of `question-generator-worker/` as a new `question-worker/`
service: single LangGraph state machine for the whole pipeline (not just
generate<->judge), new `generation_jobs`/`generation_job_rejected_questions`
tables dual-written alongside the existing `ai-generated-question-status`/
`ai-generated-questions` tables (Node API + frontend keep working unchanged),
same SQS queue/S3 bucket/OpenRouter LLM as the live system. Old worker stays
on disk, dropped from docker-compose (full replacement, not side-by-side).

## Phase 0 — Docs
- [x] Write `question_worker_implementation_plan.md`
- [x] Write this `todo.md` section

## Phase 1 — Scaffold
- [ ] `question-worker/` dir tree, `requirements.txt`, `Dockerfile`, `.env.example`
- [ ] `src/config.py` (pydantic-settings, all env vars)
- [ ] `src/models/job.py`, `state.py`, `outputs.py`

## Phase 2 — Services
- [ ] `src/services/storage.py` (aioboto3 S3, tenacity)
- [ ] `src/services/db.py` (Supabase async client, generation_jobs + rejected table + dual-write helpers)
- [ ] `src/services/llm.py`, `embeddings.py`
- [ ] `src/services/status.py`
- [ ] `src/utils/logging.py`, `retry.py`

## Phase 3 — Graph nodes
- [ ] `validate` (idempotency via generation_jobs upsert)
- [ ] `fetch_pdf`
- [ ] `extract` (scanned/too-short detection)
- [ ] `chunk_embed` (RecursiveCharacterTextSplitter)
- [ ] `select_chunks` (topic similarity + no-topic spread selection)
- [ ] `generate`
- [ ] `dedupe` (embedding cosine near-duplicate filter — new, separate from judge)
- [ ] `judge` (structured verdicts incl. reason)
- [ ] `persist` (dual-write)

## Phase 4 — Graph wiring + consumer
- [ ] `src/graph/errors.py`, `src/graph/build.py` (retry policies, conditional edge)
- [ ] `src/consumer/sqs_consumer.py`, `dispatcher.py`
- [ ] `src/main.py` (signal handling, graceful shutdown)

## Phase 5 — Tests + migration + cutover
- [ ] Unit tests per node (mocked services)
- [ ] Graph-level tests (full-accept / partial-regen / rounds-exhausted)
- [ ] Consumer tests (ack/nack/heartbeat/shutdown)
- [ ] `migrations/001_generation_jobs.sql` (NOT auto-applied — handed to user)
- [ ] `docker-compose.yml` cutover (fastapi-worker -> ./question-worker)
- [ ] Full suite green
- [ ] `question_worker_walkthrough.md`

---

# Agentic Chatbot — TODO

## Phase 0 — Docs
- [x] Write `agentic_chatbot_implementation_plan.md`
- [x] Write this `todo.md`

## Phase 1 — Backend scaffold (no persistence)
- [x] `ai-agent-chatbot/` directory structure, `requirements.txt`, `Dockerfile`, `.env.example`
- [x] `auth/supabase_auth.py` — bearer token verification (mirrors `requireAuth.ts`)
- [x] `agent/tools/qgen_api_client.py` — httpx wrapper around TS API endpoints
- [x] `agent/tools/langchain_tools.py` — `@tool` wrappers using Command/InjectedState, bearer token via contextvar
- [x] `agent/state.py`, `agent/prompts.py`, `agent/nodes.py`, `agent/graph.py` — LangGraph agent
- [x] `models/schemas.py` — request/response DTOs
- [x] `routers/health.py`, `routers/upload.py`, `routers/chat.py`, `main.py`
- [x] `scripts/chat_cli.py` — terminal test harness
- [x] Python syntax/import sanity pass — installed real deps in a throwaway venv, imported every module,
      built the actual StateGraph, and smoke-tested both the `stream_mode=["updates","custom"]` tuple shape
      and the ToolNode+Command+InjectedState pattern against the real langgraph==0.6.6 API (all confirmed
      working). Groq tool-calling responses and live TS-API calls are NOT exercised — no credentials here.

## Phase 2 — Persistence
- [x] SQL migration: `agent_chat_sessions`, `agent_chat_messages` (+ RLS) — `migrations/001_agent_chat_tables.sql`
- [x] `persistence/checkpointer.py` — `AsyncPostgresSaver` isolated into a `langgraph` schema via search_path
- [x] `persistence/chat_store.py` — session/message CRUD
- [x] Wire session CRUD into `routers/chat.py`

## Phase 3 — Real planner
- [x] `knowledge/ai-question-generator-basics.md`
- [x] `agent/prompts.py` — real system prompt embedding the knowledge doc + live session-state snapshot
- [x] Clarifying-question / completeness-check logic (system prompt + required-fields list)
- [x] Join-code availability folded into `publish_assessment` tool (auto-retry on collision) rather than a
      separate LLM-callable tool — see langchain_tools.py docstring for why
- [x] New TS endpoint `GET /assessment-code-available/:code` (`index.ts` + `SupabaseOperator.isAssessmentCodeAvailable`)

## Phase 4 — SSE streaming
- [x] `streaming/sse.py` — event mapping, verified against real langgraph streaming API
- [x] `POST /sessions/{id}/chat` real SSE implementation
- [x] `routers/help.py` — `GET /help/basics`

## Phase 5 — Angular integration
- [x] `AgenticModeService`
- [x] `/agent-api` wiring (server.ts, server-url.interceptor.ts, auth.interceptor.ts, environment*.ts)
- [x] `dashboard-layout` toggle + content-area swap
- [x] `models/agent-chat.model.ts`
- [x] `services/agent-chat.service.ts`
- [x] `pages/dashboard/agent-chat/` component tree (agent-chat, message-list, composer, published-quiz-card)
- [x] Verified via `ng build --configuration development` — clean compile, browser + SSR server bundles both built successfully

## Phase 6 — Infra + tests + walkthrough
- [x] `docker-compose.yml` + `.env.example` updates (new `ai-agent-chatbot` service block, `frontend` env var, root `.env.example` vars)
- [x] Python tests — 11 tests in `tests/test_tools.py` + `tests/test_planner.py`, all passing in a real venv
- [x] Angular tests — `agentic-mode.service.spec.ts` (7) + `agent-chat.service.spec.ts` (6), all passing; full existing
      suite (86 tests total) still green, zero regressions
- [x] `agentic_chatbot_walkthrough.md`
- [ ] Manual live E2E (blocked — requires real Groq/Supabase credentials; not run in this session)

All phases complete except the credential-gated live E2E — see walkthrough's
"What's left" section.

## Phase 7 — Minimization: drop checkpointer, SSE -> frontend polling, add update_assessment
Plan: `C:\Users\palga\.claude\plans\purrfect-beaming-raven.md`

### Backend
- [x] Delete checkpointer.py, schema.py, windows_loop.py, streaming/ package
- [x] Edit migrations/001_agent_chat_tables.sql (add processing/current_tool/current_step cols)
- [x] Rewrite agent/state.py (drop assessment_brief, add rebuild functions + chat_log/last_assessment_id)
- [x] Rewrite agent/nodes.py (drop intake/responder, wire progress writes, chat_log entries)
- [x] Rewrite agent/graph.py (collapse topology, drop checkpointer param)
- [x] Rewrite agent/prompts.py (drop assessment_brief arg, add last_assessment_id context)
- [x] New agent/runner.py (turn orchestration, replaces streaming/sse.py)
- [x] Edit persistence/chat_store.py (start_processing/set_progress/finish_processing)
- [x] Edit routers/chat.py (202 + polling contract, drop SSE)
- [x] Edit models/schemas.py (SessionSummary new fields)
- [x] Edit agent/tools/qgen_api_client.py (add update_assessment)
- [x] Edit agent/tools/langchain_tools.py (rename start_generation->generate_questions, add update_assessment tool)
- [x] Edit knowledge/ai-question-generator-basics.md (scoped update capability language)
- [x] Edit main.py (drop lifespan checkpointer)
- [x] Edit config.py + .env.example (remove DATABASE_CONNECTION_STRING)
- [x] Edit requirements.txt (remove psycopg/checkpoint-postgres/sse-starlette/pydantic-settings)
- [x] Edit run_dev.py (drop windows branch)
- [x] Edit scripts/chat_cli.py (new get_graph signature, local rows accumulation)
- [x] Edit agent/request_context.py (doc comment update)
- [x] New tests/test_state_rebuild.py
- [x] New tests/test_graph_structure.py
- [x] Update tests/test_tools.py (rename + update_assessment tests)
- [x] Update tests/test_planner.py (new build_system_prompt signature)
- [x] Run pytest — 30 passed
- [x] Bonus: Dockerfile (drop build-essential/libpq-dev), docker-compose.yml (drop DATABASE_CONNECTION_STRING from agent service), added ai-agent-chatbot/.gitignore (.env was unprotected)

### Frontend
- [x] Edit models/agent-chat.model.ts (new session fields, drop SSE types, drop toolActivity)
- [x] Edit services/agent-chat.service.ts (drop streamChat/parseFrame, add sendMessage/pollSession)
- [x] Rewrite services/agent-chat.service.spec.ts (drop parseFrame tests, add sendMessage/pollSession tests)
- [x] Edit pages/dashboard/agent-chat/agent-chat.ts (rewrite onSend/resumeSession/pollTurn, drop applyEvent)
- [x] Edit pages/dashboard/agent-chat/agent-chat.html + .scss (live status row)
- [x] Edit pages/dashboard/agent-chat/message-list/message-list.html + .scss (drop toolActivity block)
- [x] Fixed a gap found during implementation: publish_assessment's outcome now persists as its own
      assistant-role row (tool_payload=published) so the published-quiz-card still renders — the
      generic tool-role chat_log rows are correctly hidden from the chat UI (agent/runner.py)
- [x] ng build (dev config) — browser + SSR server bundles both compiled cleanly
- [x] ng test — 82/82 passing, zero regressions across the full existing suite

### Verification
- [x] pytest in ai-agent-chatbot — 30/30 passed
- [x] ng build in ai-metimeter-client — clean
- [x] ng test in ai-metimeter-client — 82/82 passed
- [x] Updated agentic_chatbot_walkthrough.md to reflect the new architecture (polling, no checkpointer, update_assessment)
- [ ] Manual live E2E (blocked — requires running question-generator-api-ts + Redis + worker)
- [ ] Run the updated migrations/001_agent_chat_tables.sql against the real Supabase project (adds processing/current_tool/current_step columns)

Phase 7 complete except the live E2E through question-generator-api-ts and running the
updated SQL migration against the real Supabase project.

## Phase 8 — Swap agent LLM from Groq to Gemini
- [x] requirements.txt: langchain-groq -> langchain-google-genai==4.2.7, bumped langchain-core to >=1.4.7,<2.0.0
      (langchain-google-genai's own constraint; verified no conflicts via `pip check`)
- [x] config.py: GROQ_API_KEY/AGENT_GROQ_MODEL -> GEMINI_API_KEY/AGENT_GEMINI_MODEL (default gemini-2.5-flash)
- [x] agent/graph.py: ChatGroq -> ChatGoogleGenerativeAI
- [x] Updated ai-agent-chatbot/.env.example, root .env.example, docker-compose.yml (ai-agent-chatbot service block only —
      question-generator-worker's own GROQ_API_KEY/GROQ_MODEL for MCQ extraction is untouched, different service/job)
- [x] Wrote the real GEMINI_API_KEY into ai-agent-chatbot/.env; removed leftover unused DATABASE_CONNECTION_STRING
      block from that file too (dead since Phase 7 dropped the checkpointer, missed at the time)
- [x] Updated tests/test_graph_structure.py's skipif + scripts/chat_cli.py's docstring + agent/state.py's
      ToolMessage-pairing comment (genericized away from "Groq's (OpenAI-compatible) API") + qgen_api_client.py docstring
- [x] pytest: 30/30 passed
- [x] Live-verified with the real key: plain chat completion works, AND tool-calling works — Gemini correctly
      selected generate_questions with well-formed args in the exact ToolCall shape LangGraph expects
- [x] Updated agentic_chatbot_walkthrough.md's remaining Groq references (question-generator-worker's own
      Groq usage for MCQ extraction is a separate, unrelated concern and was left alone)

## Phase 9 — Bugfix: chat ends before generation is acted on
- [x] Root cause: poll_generation_node (agent/nodes.py) only wrote its outcome to chat_log (DB/UI)
      and top-level state fields (job_status/questions) — never to state["messages"], so the planner's
      next LLM call had no explicit conversational signal that generation finished, only a bare status
      number in the system prompt. Pre-existing gap from the original build, not introduced by Phase 7/8 —
      just never exercised with real credentials until now.
- [x] Fix: poll_generation_node now also appends an AIMessage describing the outcome (started/failed/
      completed-with-N-questions) to state["messages"] on every return branch.
- [x] pytest: 30/30 passed after fix

## Phase 10 — Diagnosed via real session data: two more bugs
Queried agent_chat_messages directly for the user's actual failing session (96c08578-...) rather
than guessing from logs. Found:
1. **Real root cause of "stops before publishing"**: generation jobs 200/201/202 in that session
   all have job_status=3 (FAILED) — confirmed straight from the DB. Not an agent-side bug at all;
   question-generator-worker's own pipeline is failing every attempt. A 429 rate-limit error for
   `llama-3.3-70b-versatile` appears earlier in the same session, and question-generator-worker
   uses that same Groq model for MCQ extraction — very likely cause. Flagged to user to check
   question-generator-worker's own terminal/logs; out of scope for ai-agent-chatbot's own code.
2. **Real code bug found from the same data**: several persisted assistant messages were garbled
   JSON-ish text like `[{"type":"text","text":"...", "extras": {...}}]` instead of clean text —
   Gemini's `response.content` isn't always a plain string (structured "thought signature" content
   blocks for tool-calling continuity), and planner_node was storing it as-is into chat_log/DB
   without normalizing. Fixed: use `response.text` (LangChain's normalizing property) for
   chat_log/DB/logging; the raw `response` object (whatever shape .content is) still goes into
   state["messages"] unmodified, since Gemini may need its own structured content back for
   correct within-run continuity.
- [x] Also strengthened poll_generation_node's terminal-outcome messages: separated timeout (loop
      exhausted MAX_POLL_ATTEMPTS without a terminal status) from genuine FAILED status (previously
      conflated), and made the in-turn AIMessage for each outcome much more explicit/directive
      ("this is a terminal outcome, not still in progress... tell the teacher plainly...") since the
      bare status label alone was observed being misread by the model as "still in progress" —
      inconsistently: it correctly explained a failure once but not other times with the same input
      shape, most likely because the garbled-content bug (above) was polluting its own context.
- [x] pytest: 30/30 passed
- [x] Live-verified: reproduced the exact failure scenario from the user's real session (job status
      FAILED) and confirmed the model now reliably responds "generation failed, want to retry?"
      instead of the previous inconsistent "started generating... will confirm once complete"
- [x] Live-verified with real Gemini calls: reproduced the LLM proceeding to call publish_assessment
      correctly once the completion message is present in its context

## Phase 11 — Root-caused via live testing: question-generator-worker's Groq key was EXPIRED,
## then switched question-generator-worker to Gemini too (user request)
- [x] Diagnosed the real cause of every generation job failing (200/201/202, all job_status=3):
      tested the worker's actual GROQ_API_KEY+model directly against Groq — 401 `expired_api_key`,
      not a rate-limit issue. Not a code bug at all.
- [x] User asked to move question-generator-worker to Gemini too (was Groq's `openai/gpt-oss-120b`
      via the `groq` SDK, raw chat.completions.create with reasoning_effort="low"). Noticed stray
      pre-existing "Gemini" references in error messages/comments (question_generator.py line 98,
      _MAX_API_RETRIES comment) — this codebase apparently used Gemini at some point before an
      earlier migration to Groq; those comments are now accurate again rather than stale.
- [x] helpers/question_generator.py: groq.Groq -> google.genai.Client; _call_groq -> _call_gemini
      using client.models.generate_content with response_mime_type="application/json" (Gemini's
      native JSON mode — existing _parse_and_validate() already tolerant of surrounding
      prose/fences, so no parsing changes needed) and thinking_config=ThinkingConfig(thinking_budget=0)
      (disables extended reasoning for this bulk-extraction task, matching the old
      reasoning_effort="low" intent and avoiding "thought signature" content blocks). Renamed
      GROQ_API_KEY/GROQ_MODEL -> GEMINI_API_KEY/GEMINI_MODEL (default gemini-2.5-flash), all
      "[Groq]" log prefixes -> "[Gemini]".
- [x] helpers/tracing.py: openinference.instrumentation.groq.GroqInstrumentor ->
      openinference.instrumentation.google_genai.GoogleGenAIInstrumentor (verified this package
      exists on PyPI and confirmed the correct class name by installing and inspecting it).
- [x] requirements.txt: groq>=0.11.0 -> google-genai==1.69.0; openinference-instrumentation-groq
      -> openinference-instrumentation-google-genai>=1.2.0.
- [x] Updated question-generator-worker/.env (real key), root .env and .env.example (consolidated
      into one shared "Gemini LLM" section: GEMINI_API_KEY shared, GEMINI_MODEL for the worker and
      AGENT_GEMINI_MODEL for the agent — mirrors the old shared-GROQ_API_KEY/per-service-model-var
      pattern), docker-compose.yml's fastapi-worker block.
- [x] Verified main.py and helpers modules import cleanly; live end-to-end test of the actual
      generate_questions_with_llm() function produced 3 valid, correctly-structured questions
      (tenacity retry correctly handled transient 429s along the way).
- [x] Flagged to user: the Gemini key in use is on the free tier (20 requests/day per model,
      confirmed via the actual RESOURCE_EXHAUSTED error) — shared across ai-agent-chatbot and
      question-generator-worker now, likely to be hit again during real testing. Needs billing
      enabled on the Google Cloud project for headroom, or a separate key per service.
- [x] Noted, not touched: unrelated venv contamination in question-generator-worker/.venv
      (langchain-groq/langgraph installed there even though never imported by this service's code —
      also explains why `fastapi dev` earlier in this session showed that venv's site-packages path
      when starting ai-agent-chatbot). Also noted, not touched: a stray `.claude/worktrees/
      trusting-moore-837e44/` directory contains a separate, unrelated worktree checkout of this
      repo — out of scope.

## Phase 12 — Switched both services again: Gemini -> OpenRouter (Kimi K2)
User initially pasted a "castai_v1_..." key claiming it was a Kimi key — verified via WebFetch that
CastAI does run a real multi-provider LLM gateway (so not dismissed out of hand), but live-tested
the key against 6 different models on that gateway and every one returned "provider has exhausted
its credits" or "no registered providers found" — an account-level CastAI billing issue, not
fixable in code. Held off implementing until user provided a working OPENROUTER_API_KEY instead
(sk-or-v1-... format, verified live: plain chat, tool-calling with our actual ALL_TOOLS schemas via
LangChain, and the worker's MCQ-generation prompt shape all confirmed working before writing any
code). Model: moonshotai/kimi-k2, needs an explicit max_tokens cap (observed 402 "requires more
credits, or fewer max_tokens" at the model's 65536-token default; 1000 works fine for the agent's
tool-call turns, existing _completion_token_budget()'s 2400 ceiling works fine for the worker).
Confirmed response_format="json_object" is NOT supported for this model/provider combo on
OpenRouter (400 "does not support feature: structured-outputs") — kept the existing prompt-driven
JSON + tolerant _parse_and_validate() approach instead, same as the original design.

- [x] ai-agent-chatbot: agent/graph.py ChatGoogleGenerativeAI -> langchain_openai.ChatOpenAI
      (base_url=https://openrouter.ai/api/v1, max_tokens=1000); config.py GEMINI_API_KEY/
      AGENT_GEMINI_MODEL -> OPENROUTER_API_KEY/AGENT_OPENROUTER_MODEL (default moonshotai/kimi-k2);
      requirements.txt langchain-google-genai -> langchain-openai==1.3.5 (tightened langchain-core
      pin to >=1.4.9 per langchain-openai's actual constraint); updated remaining Gemini-specific
      comments (nodes.py's .text-normalization note generalized to be provider-agnostic — kept the
      .text usage itself since it's harmless/safe for any provider, not just Gemini; qgen_api_client.py,
      chat_cli.py, test_graph_structure.py's skipif).
- [x] question-generator-worker: helpers/question_generator.py google.genai.Client -> openai.OpenAI
      pointed at OpenRouter, _call_gemini -> _call_openrouter (plain chat.completions.create, no
      response_format); OPENROUTER_API_KEY/OPENROUTER_MODEL (default moonshotai/kimi-k2);
      helpers/tracing.py GoogleGenAIInstrumentor -> OpenAIInstrumentor (openai SDK usage now covers
      OpenRouter too since it's OpenAI-compatible); requirements.txt google-genai -> openai==2.46.0,
      openinference-instrumentation-google-genai -> openinference-instrumentation-openai.
- [x] Updated both services' .env + .env.example, root .env + .env.example (consolidated into one
      shared "OpenRouter LLM" section: OPENROUTER_API_KEY shared, OPENROUTER_MODEL for the worker,
      AGENT_OPENROUTER_MODEL for the agent), docker-compose.yml (both service blocks).
- [x] pytest: 30/30 passed. Live-verified end-to-end for both services with the real key: agent's
      full compiled graph builds and its tools bind correctly; worker's actual
      generate_questions_with_llm() produced 3 valid, correctly-structured questions.
- [x] Swept both codebases for leftover Gemini references — none found.

---

# SQS Question-Generation Queue — TODO

Plan: `sqs_question_queue_implementation_plan.md`

Replaces HTTP dispatch + in-memory `asyncio.Queue` with SQS on ministack,
consumed by a standalone boto3 receiver. Failure policy: **never delete the
message**, exponential backoff, 3 attempts, then DLQ.

## Phase 0 — Design
- [x] Brainstorm + evaluate Celery / Dramatiq / Taskiq / FastStream vs plain boto3
- [x] Verify ministack SQS live: long polling, VisibilityTimeout, RedrivePolicy→DLQ,
      ChangeMessageVisibility, ApproximateReceiveCount — all confirmed working
- [x] Write `sqs_question_queue_implementation_plan.md`

## Phase 1 — Infrastructure
- [x] Purge 4 stale test messages from `question-generator`
- [x] `ministack/init/init-lambda.sh` — provision queue + DLQ + redrive (idempotent)
- [x] Verify attributes read back: `VisibilityTimeout=900`, `RedrivePolicy` wired
- [x] `PERSIST_STATE`/`STATE_DIR` added to ministack service
- [x] Live-verified self-heal: recreated ministack container, watcher re-provisioned
      queue+DLQ+redrive automatically within ~10s, no manual intervention

## Phase 2 — Receiver (question-generator-worker) — TDD, 17 tests passing
- [x] `requirements.txt` — add `boto3`
- [x] `helpers/question_generator.py` — made `save_questions_to_db` idempotent
      (delete-by-jobId before insert) — test-driven, red confirmed then fixed
- [x] `helpers/backoff.py` — `infra_backoff_seconds`, `job_backoff_seconds`,
      `InfraBackoffTracker` — 5 tests
- [x] `helpers/heartbeat.py` — `start_heartbeat` (periodic ChangeMessageVisibility
      via background thread, survives transient failures) — 2 tests
- [x] `helpers/receiver.py` — `parse_job` + `handle_message` (delete only on
      success; never delete on failure; final attempt marks STATUS_FAILED;
      heartbeats during the pipeline call) — 8 tests, including heartbeat integration
- [x] `helpers/sqs_client.py` — boto3 client factory + queue URL resolution
      (never trusts the localhost URL SQS returns)
- [x] `helpers/pipeline.py` — `run_pipeline`/`update_job_status` relocated from
      main.py, internals untouched
- [x] `consumer.py` — new entrypoint: SIGTERM/SIGINT handling, wait_for_queue,
      infra-backoff-wrapped receive loop, dispatches to handle_message
- [x] Delete `main.py`; update `Dockerfile` (CMD → consumer.py, drop EXPOSE 8000)
- [x] Live smoke test: built image, ran against real ministack, sent a real
      SQS message, confirmed pickup + real Supabase 404 + correct non-delete +
      visibility-extend behavior; consumer loop survived the exception

## Phase 3 — Publisher (question-generator-api-ts) — TDD
- [x] Add `@aws-sdk/client-sqs` (found already resolving from Bun's global
      cache but undeclared in package.json/bun.lock — fixed via `bun add`)
- [x] `config/config.ts` — `AWS_SQS_CONFIG` (already added by user in parallel)
- [x] `helpers/sqsClient.ts` — already added by user in parallel; wired into
      `Publisher` rather than replaced
- [x] `helpers/publisher.ts` — `Publisher` takes injected sqsClient
      (defaults to real one — all 7 existing `new Publisher()` call sites in
      index.ts untouched); `publishToQuestionGenerationQueue` uses `sendMessage`
- [x] Confirm `index.ts` needs no change — verified all 7 call sites
- [x] `tsc --noEmit` — confirmed zero new errors (7 pre-existing, unrelated,
      diffed against git stash baseline)

## Phase 4 — Compose + env
- [x] `docker-compose.yml` — AWS_* + queue URLs on worker AND api (api now
      also gets AWS_BUCKET_* — pre-existing gap since s3Client.ts read these
      but compose never passed them)
- [x] `stop_grace_period: 30s`, drop `expose: 8000`, depends_on ministack healthy
- [x] `.env.example` — no changes needed; confirmed existing convention is
      ministack test creds as compose-level defaults, not documented secrets

## Phase 5 — Validation
- [x] Queue attributes correct (live-verified twice: initial + post-recreate)
- [x] Manual `send-message` → consumer picks up (live-verified)
- [ ] Full E2E upload → status 2, questions saved once (needs a real uploaded
      PDF + full stack running; not exercised this session)
- [x] Idempotency: unit-tested (delete-before-insert ordering)
- [x] Backoff: unit-tested + live-verified (message not deleted, visibility
      extended after a real Supabase 404)
- [x] DLQ: mechanics live-verified earlier (3 receives → DLQ); final-attempt
      logic unit-tested; full live 3-attempt cycle not run (~18min real-time,
      deterministic behavior already covered by tests)
- [ ] Crash mid-job: redelivers, no duplicates (not exercised live this session)
- [ ] Infra backoff: stop ministack, consumer survives and recovers (unit-tested
      via InfraBackoffTracker; not exercised live this session)
- [x] Write `sqs_question_queue_walkthrough.md`

---

# LangGraph Question Generation — TODO

Plan: `langgraph_question_generation_implementation_plan.md`

Replaces the flat retry loop in `question-generator-worker/helpers/question_generator.py`
with (1) chunking + embeddings-based topic-relevant text selection for documents
longer than one page, and (2) a LangGraph generate<->judge loop that checks topic
fit, difficulty fit, and semantic-duplicate status before accepting a question.
Built via two parallel subagents (chunking.py and the qgen_graph package are
independent — disjoint files, no shared dependency between them), then wired
together by hand.

- [x] `requirements.txt` — add `langgraph==0.6.6`, `langchain-core>=1.4.9,<2.0.0`,
      `langchain-openai==1.3.5` (versions already present in the shared .venv via
      pre-existing cross-service contamination — confirmed exact versions match)
- [x] `helpers/chunking.py` (new, TDD, 5 tests) — `chunk_text` (fixed-size
      overlapping windows, 4-chars/token heuristic, no tokenizer dependency),
      `rank_chunks_by_topic` (one batched OpenRouter embeddings call, plain-Python
      cosine similarity, no numpy), `select_relevant_text` (public entry point;
      short-circuits the embeddings call entirely when the document already has
      <= k chunks). New env var `OPENROUTER_EMBEDDING_MODEL` (default
      `openai/text-embedding-3-small`), reuses existing `OPENROUTER_API_KEY`.
- [x] `helpers/qgen_graph/` (new package, TDD, 7 tests) — `state.py`
      (`QuestionGenState` TypedDict), `prompts.py` (generation prompt moved
      as-is minus the old 4,500-char truncation + new judge prompt),
      `nodes.py` (`make_generate_node`/`make_judge_node`/`route_after_judge`,
      LLM injected via factory closures mirroring `ai-agent-chatbot/agent/nodes.py`),
      `graph.py` (`build_graph`/`get_graph`/`run_generation` — `ChatOpenAI` on
      OpenRouter, mirrors `ai-agent-chatbot/agent/graph.py` exactly)
- [x] Fixed a circular import discovered at wiring time: `question_generator.py`
      needs `qgen_graph.graph.run_generation`, but `qgen_graph/nodes.py` needs
      `_fingerprint`/`_deduplicate`/`_parse_and_validate` — extracted those three
      into a new `helpers/mcq_validation.py` with no dependents of its own;
      `question_generator.py` re-exports them (existing/new tests still import
      from there unchanged)
- [x] Thinned `helpers/question_generator.py`: `generate_questions_with_llm`
      keeps its exact signature/return type (`pipeline.py` untouched); internally
      now calls `select_relevant_text()` then `qgen_graph.graph.run_generation()`
- [x] Full test suite: 31 passed (19 pre-existing + 5 chunking + 7 qgen_graph),
      zero regressions
- [x] Live-verified end-to-end with the real OPENROUTER_API_KEY: short-document
      path (chunking short-circuits, 2 LLM calls: 1 generate + 1 judge, both
      questions accepted); confirmed the OpenRouter embeddings endpoint works
      live with `openai/text-embedding-3-small` (1536-dim vectors); confirmed
      `rank_chunks_by_topic` correctly ranks a pure-topic chunk above mixed and
      off-topic chunks on a real embeddings response
- [x] Updated this `todo.md`
- [x] Write `langgraph_question_generation_walkthrough.md`

---

# Bug Fix — stale_after exceeds visibility_timeout — TODO

RCA: `RCA_Bug_StaleAfterExceedsVisibilityTimeout.md` (Bug 4 of
`RCA_Bug_QuestionWorkerConcurrentDeliveryFalseFailure.md`). Approved fix:
derive `stale_after` from `sqs_visibility_timeout` with a safety margin
instead of from `visibility_heartbeat_interval * 3` (180s > the 120s
visibility timeout it's meant to respect).

- [x] Diagnose + write `RCA_Bug_StaleAfterExceedsVisibilityTimeout.md`
- [x] Brainstorm 3 distinct fix options, get user approval on "derive from
      visibility_timeout" approach
- [x] `question-worker/src/graph/nodes/validate.py` — replace
      `_STALE_IN_PROGRESS_MULTIPLIER`-based derivation with
      `stale_after = max(sqs_visibility_timeout - margin, floor)`
- [x] Update `test_nodes/test_validate.py` — boundary tests proving
      `stale_after` now tracks `sqs_visibility_timeout`, not
      `visibility_heartbeat_interval` (7/7 passed)
- [x] Run `question-worker` test suite, confirm green (48/48 passed, user-verified)
- [x] Write `StaleAfterExceedsVisibilityTimeout_walkthrough.md`

Two more bugs found and fixed along the way (not part of the original Bug 4
scope, surfaced while getting the suite to actually run to completion):
- [x] `tests/test_consumer.py`'s `FakeSQSClient.receive_message` starved the
      event loop (no real yield point) — added `await asyncio.sleep(0)`,
      test-only fix, no production code touched
- [x] `models/state.py`'s `PipelineState` was missing `skip_reason` as a
      declared field — LangGraph silently dropped it on every node return,
      so "skip already-completed jobs" never actually worked. Added
      `skip_reason: str | None` to the schema.
- [x] RCA: `RCA_Bug_QuestionWorkerSkipReasonDroppedFromState.md`
- [ ] `.gitignore` — still missing a `question-worker/**/__pycache__` (or
      generic `__pycache__/`) exclusion; flagged, not yet applied
