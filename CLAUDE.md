# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered assessment platform where teachers upload PDFs, use Groq LLM to generate MCQs, publish quizzes with join codes, and students attempt them with a countdown timer. Reports track performance.

## Services Architecture

| Service | Directory | Runtime | Port |
|---|---|---|---|
| Frontend (Angular SSR) | `ai-metimeter-client/` | Node.js 22 | 4000 |
| Question Generator API | `question-generator-api-ts/` | Bun | 3000 |
| Question Generator Worker | `question-generator-worker/` | Python 3.12 | 8000 |
| File Scanner Worker | `file-scanner-worker/` | Node.js | — |
| Attempt API | `AttemptAPI/` | .NET 10 | 5136 |
| Reports API | `ReportsAPI/` | .NET 10 | 5082 |
| Redis | (Docker) | Redis 7 | 6379 |
| ClamAV | (Docker) | ClamAV | 3310 |

All services are orchestrated via `docker-compose.yml`. The frontend SSR server (`server.ts`) acts as a reverse proxy routing `/api/*` → question-generator-api, `/reports-api/*` → ReportsAPI, `/attempt-api/*` → AttemptAPI.

## Environment Setup

```bash
cp .env.example .env
# Fill in: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET_ID,
#          GROQ_API_KEY, GROQ_MODEL, REDIS_PASSWORD, DATABASE_CONNECTION_STRING, CORS_ORIGIN
```

## Commands

### Docker (full stack)
```bash
docker compose up --build     # Start everything
docker compose down           # Stop everything
docker compose logs -f [svc]  # Stream logs for a service
```

### Frontend (Angular 21 SSR)
```bash
cd ai-metimeter-client
npm install
npm run dev      # ng serve (dev, no SSR)
npm run build    # production build
npm run test     # Vitest unit tests
```

### Question Generator API (Bun/TypeScript)
```bash
cd question-generator-api-ts
bun install
bun --watch index.ts   # dev with reload
bun index.ts           # start
```

### Question Generator Worker (Python/FastAPI)
```bash
cd question-generator-worker
python -m venv .venv
source .venv/Scripts/activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### .NET APIs
```bash
cd AttemptAPI   # or ReportsAPI
dotnet restore
dotnet run
```

### File Scanner Worker
```bash
cd file-scanner-worker
npm install
node consumer.js
```

## Data Flow

### Question Generation Pipeline
1. Frontend uploads PDF → `POST /api/file-upload` (Node API) → Supabase Storage + Redis `scan_queue`
2. File Scanner Worker: ClamAV scans; infected files auto-deleted
3. Frontend sends `POST /api/generate-questions` → Node API creates job in `ai-generated-question-status` table, publishes to FastAPI worker
4. FastAPI Worker: downloads file, extracts text (PyMuPDF), calls Groq API, saves questions to `ai-generated-questions` table, updates job status to 2 (COMPLETED)
5. Frontend polls `GET /api/generate-questions-status/:id` every 2s until complete, then fetches `GET /api/generated-questions/:id`

### Quiz Attempt Flow
1. Student submits answers → `POST /attempt-api/api/attempts/submit` (AttemptAPI, .NET)
2. Teacher views reports → `GET /reports-api/api/dashboard/stats[/:id]` (ReportsAPI, .NET)

## Key Architectural Details

### LLM Integration (`question-generator-worker/helpers/question_generator.py`)
- 3 outer retries + 3 API retries with exponential backoff
- MD5 fingerprint deduplication of normalized question text
- Dynamic token budget: 180 tokens × num_questions
- Difficulty-aware prompt engineering, strict JSON schema output

### Job Status Enum (used across services)
- `0` = Queued, `1` = Processing, `2` = Completed, `3` = Failed

### Frontend Polling (`assessment.service.ts`)
- Polls every 2s with RxJS; stops on status 2 or 3, retries on network errors

### Auth
- Supabase Auth for user sessions; Service Role Key used server-side for admin DB operations

### Supabase Tables
- `ai-generated-question-status` — job tracking with UUID id + int status
- `ai-generated-questions` — generated MCQs (question, options JSON, correct_option, explanation)
- `assessment_table` — quizzes (title, subject, topic, difficulty, questions JSON, join code, timeLimit, status)
- Attempt/report tables managed by .NET APIs via raw SQL (Dapper + Npgsql)

## Tech Stack Quick Reference

- **Angular 21** — standalone components, signals, lazy-loaded routes, Angular Material
- **Bun** — runtime for the TypeScript Question Generator API (not Node)
- **FastAPI** — async single-queue worker pattern to avoid race conditions on LLM calls
- **Dapper** — lightweight ORM in .NET services (raw SQL, no EF Core)
- **Redis** — FIFO job queues (`scan_queue` for files, direct HTTP for question generation)


# Important Instructions

## Feature
Always start with breaking complex problems into TODO list and mark each item after completion.
Always go in seuquence don't skip a single step.
At the start after ultrathinking and brainstorming just give me the feature_name_implementation_plan.md file.
At the end give me feature_name_walkthrough.md file that
explains the approach in simple and understandable manner with the help of diagrams.

## Behavior Rules

- Before starting any multi-step task, write a TODO list in a `todo.md` file
- Mark items as `[x]` when done, `[ ]` when pending, `[~]` when in progress
- After each step, update `todo.md` before moving to the next
- Do not skip steps — if blocked, note it in the todo instead of silently moving on
- At the end of every task, summarize what was done and what remains

## Bugs
Always start with Ultrathinking to understand the cause.
Give the RCA in RCA_Bug_NAME.md file and also break this bug into to-do list.

## Explore Questions
Always start with Ultrathinking to understand the codebase.
Start with TO-DO list, and follow the sequence without skipping the one.


## IMPORTANT NOTE
If you have any doubt then ask the questions in interactive interface.
No need of assuming anything by default.