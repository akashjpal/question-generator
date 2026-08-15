# CI Pipeline — Implementation Plan

## Goal
GitHub Actions CI for every service in the monorepo, plus a headless-Playwright
e2e job against the full `docker compose` stack that always emails the run
result to palgayatrij786@gmail.com.

## Decisions (confirmed with user)
| Question | Decision |
|---|---|
| CI platform | GitHub Actions (repo is on `github.com/akashjpal/question-generator`) |
| Lightweight per-service CI trigger | Every push + every PR, all branches, path-filtered per service |
| E2E (Playwright) trigger | Push to `dev`/`prod` + manual `workflow_dispatch` |
| Email method | Gmail SMTP + App Password via `dawidd6/action-send-mail`, secrets `SMTP_USERNAME`/`SMTP_PASSWORD` |
| Email condition | Always (pass or fail) |
| CD / image publishing | Out of scope — this is validation CI only, not deploy |

## Why per-service workflows, not one big workflow
Path-filtered, independent workflow files mean a `.NET`-only change doesn't
spend CI minutes rebuilding the Angular client, and one service's failure
doesn't block visibility into another's. Matches repo's existing
polyglot/microservice structure (`CLAUDE.md` services table).

## Services → CI job design

| Service | Runtime | Job steps | Notes |
|---|---|---|---|
| `ai-metimeter-client` | Node 22 | `npm ci` → `npm run build` → `npm run test` | Vitest via `@angular/build:unit-test`, headless by default, no browser needed |
| `question-generator-api-ts` | Bun | `bun install` → `bunx tsc --noEmit` | No test suite exists; type-check is the safety net |
| `question-generator-worker` | Python 3.12 | `pip install -r requirements.txt` → `python -m compileall -q .` | No tests exist; `supabase_client.py` calls `create_client()` at import time so we can't safely import `main.py` without real credentials — compileall is a syntax-only check that avoids that |
| `file-scanner-worker` | Bun | `bun install` → `node --check consumer.js` | No test suite; plain JS, syntax check only |
| `AttemptAPI` | .NET 10 | `dotnet restore` → `dotnet build -c Release` | No test project in the repo |
| `ReportsAPI` | .NET 10 | `dotnet restore` → `dotnet build -c Release` | No test project in the repo |
| `ai-agent-chatbot` | Python 3.12 | `pip install -r requirements.txt` → `pytest tests/ -v` | Real pytest suite exists (`tests/test_*.py`), fully mocked — no live credentials needed |

Each gets `.github/workflows/ci-<service>.yml` with:
```yaml
on:
  push:
    paths: ['<service-dir>/**']
  pull_request:
    paths: ['<service-dir>/**']
concurrency:
  group: ci-<service>-${{ github.ref }}
  cancel-in-progress: true
```

## E2E Playwright job (`.github/workflows/e2e-playwright.yml`)

The e2e suite already exists on this branch (`ai-metimeter-client/e2e/`,
`playwright.config.ts`) — it logs into a **real dedicated Supabase teacher
account** and drives the full app, including LLM-backed flows. It assumes
the whole `docker compose` stack is already running.

Steps:
1. Checkout.
2. Write repo-root `.env` from GitHub secrets (`SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET_ID`, `OPENROUTER_API_KEY`,
   `REDIS_PASSWORD`, `DATABASE_CONNECTION_STRING`; `CORS_ORIGIN`/
   `FRONTEND_ORIGIN`/model vars have working defaults in compose).
3. `docker compose up --build -d`.
4. Wait loop: poll `http://localhost:4200` for HTTP 200 **and** poll
   `clamav`'s container health status until `healthy` (its `start_period` is
   60s) — file-upload specs need ClamAV ready, not just the frontend.
5. `cd ai-metimeter-client && npm ci && npx playwright install --with-deps chromium`.
6. Write `.env.test` from secrets `TEST_TEACHER_EMAIL`/`TEST_TEACHER_PASSWORD`.
7. `npm run test:e2e` (already headless in CI — Playwright defaults to
   headless off-CI-machine and the config sets `workers: 1` / `retries: 1`
   under `process.env.CI`, which GitHub Actions sets automatically).
8. `if: always()` — upload `playwright-report/` as a build artifact.
9. `if: always()` — zip the report (skip attaching if >15MB, just link
   instead) and send email via `dawidd6/action-send-mail@v3`:
   subject includes ✅/❌ and branch; body links to the Actions run;
   attaches the zipped HTML report when small enough.
10. `if: always()` — `docker compose down -v` to clean up.

### New secrets the user must add (Settings → Secrets and variables → Actions)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET_ID`
- `OPENROUTER_API_KEY`
- `REDIS_PASSWORD`
- `DATABASE_CONNECTION_STRING`
- `TEST_TEACHER_EMAIL`, `TEST_TEACHER_PASSWORD` (dedicated test account only)
- `SMTP_USERNAME` (Gmail address), `SMTP_PASSWORD` (16-char Gmail App
  Password — requires 2FA enabled on that Gmail account)

Recipient `palgayatrij786@gmail.com` is hardcoded in the workflow (not
secret).

## Known characteristic carried over from the existing e2e design
`AttemptAPI`/`ReportsAPI` talk to the **real Supabase Postgres** via
`DATABASE_CONNECTION_STRING` (no local Postgres container in
`docker-compose.yml`) and LLM specs make real OpenRouter calls. This is
already how the local dev stack works and is why the test account must be
dedicated — the CI job doesn't change that, it just automates what a
developer does manually today.

## Files to be created
- `.github/workflows/ci-client.yml`
- `.github/workflows/ci-question-generator-api.yml`
- `.github/workflows/ci-question-generator-worker.yml`
- `.github/workflows/ci-file-scanner-worker.yml`
- `.github/workflows/ci-attempt-api.yml`
- `.github/workflows/ci-reports-api.yml`
- `.github/workflows/ci-ai-agent-chatbot.yml`
- `.github/workflows/e2e-playwright.yml`
- `ci_pipeline_todo.md` (progress tracker)
- `ci_pipeline_walkthrough.md` (final explainer, written at the end)
