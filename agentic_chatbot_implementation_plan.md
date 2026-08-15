# Agentic Chatbot — Implementation Plan

See full research/design rationale in the approved plan session. Condensed execution plan below.

## What we're building
A "Agentic Mode" toggle in the teacher dashboard that swaps the content area to a chat interface. A LangGraph + FastAPI service (`ai-agent-chatbot/`) drives: PDF upload → clarifying questions (title/subject/topic/difficulty/count/time limit) → question generation → publish → returns attempt link + join code — by calling the **existing** `question-generator-api-ts` HTTP endpoints (reusing all business logic/auth), not reimplementing them.

## Confirmed decisions
1. New agent service calls existing TS API endpoints (`/file-upload`, `/generate-questions`, `/generate-questions-status/:id`, `/generated-questions/:id`, `/publish-assessment`, `/api/assessments/:id`), forwarding the teacher's Supabase bearer token.
2. Chat sessions/messages persisted to Supabase; LangGraph uses a Postgres-backed checkpointer (`DATABASE_CONNECTION_STRING`, already provisioned) so in-progress flows survive refresh/restart.
3. Responses stream via SSE.
4. No new route — existing `DashboardLayout` shell stays; a signal-driven `AgenticModeService` (mirrors `ThemeService`) swaps `<router-outlet>` for `<app-agent-chat>`.
5. Knowledge doc `ai-question-generator-basics.md` stays a single static markdown file embedded directly into the system prompt — no RAG (confirmed with user; revisit only if it grows into a real multi-document corpus).
6. Join-code uniqueness gap: add one small new TS endpoint `GET /assessment-code-available/:code` rather than leaving it unchecked (agent runs unattended, unlike the human-driven wizard).

## Build phases
1. **Backend scaffold, no persistence** — `ai-agent-chatbot/` FastAPI+LangGraph service, tool wrappers around the TS API, in-memory checkpointer, CLI test harness (`scripts/chat_cli.py`).
2. **Persistence** — `agent_chat_sessions` / `agent_chat_messages` Supabase tables + RLS, `AsyncPostgresSaver` in a dedicated `langgraph` schema, session CRUD endpoints.
3. **Real planner** — knowledge doc, system prompt, clarifying-question logic, join-code-availability tool + new TS endpoint.
4. **SSE streaming endpoint** — `POST /sessions/{id}/chat`.
5. **Angular integration** — `AgenticModeService`, proxy/interceptor/environment wiring (`/agent-api`), `DashboardLayout` toggle, `agent-chat` component tree.
6. **docker-compose + env wiring**, full E2E manual pass, unit tests.

## Key files touched
- New: `ai-agent-chatbot/**` (whole new service)
- `question-generator-api-ts/index.ts`, `helpers/supabseOperator.ts` — new `GET /assessment-code-available/:code` endpoint
- `ai-metimeter-client/src/app/services/agentic-mode.service.ts` (new)
- `ai-metimeter-client/src/app/pages/dashboard/agent-chat/**` (new)
- `ai-metimeter-client/src/app/pages/dashboard/dashboard-layout/dashboard-layout.html` — toggle + content swap
- `ai-metimeter-client/src/server.ts`, `src/app/interceptors/server-url.interceptor.ts`, `src/app/interceptors/auth.interceptor.ts`, `src/environments/environment*.ts` — `/agent-api` proxy wiring
- `docker-compose.yml`, `.env.example` — new service block + vars
- `CLAUDE.md` — new service row (manual follow-up note)

## Out of scope
Non-functional `/api/assessments/:id/publish` stub, dead `quiz.service.ts` join flow, ClamAV-scan race condition, multi-session switcher UI, per-question chat editing.

## Verification
Manual E2E per the plan's verification section; Python `pytest`/`pytest-asyncio` for tool wrappers/planner logic; Angular Vitest specs for `AgenticModeService` and SSE frame parsing. Full live E2E (real Groq/Supabase calls) requires valid credentials in `.env` — not exercised automatically in this environment.
