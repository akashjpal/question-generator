# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> This is the Angular SSR frontend service within the larger `question-generator` monorepo. See the root `CLAUDE.md` (one level up) for the overall system architecture, other services, Docker orchestration, and the end-to-end data flow. This file covers only what's specific to `ai-metimeter-client`.

## Commands

```bash
npm install
npm run dev       # ng serve — dev server, no SSR, http://localhost:4200
npm run build     # ng build — production SSR build to dist/ai-quick-analysis
npm run watch     # ng build --watch --configuration development
npm run start     # node dist/ai-quick-analysis/server/server.mjs — run the built SSR server
npm run test      # ng test — unit tests (Vitest + jsdom, via @angular/build:unit-test)
npm run test:e2e  # playwright test — full e2e suite (see e2e/ section below)
```

Run a single unit test file or filter by test name:

```bash
npx ng test --include=src/app/services/theme.service.spec.ts --watch=false
npx ng test --filter="some test name" --watch=false
```

## SSR proxy architecture (`src/server.ts`)

The Express SSR server does double duty: it renders Angular pages AND reverse-proxies API calls, so the browser only ever talks to one origin (port 4000). Note this only applies to the built SSR server (`npm run start`) — `npm run dev` (`ng serve`) does not run `server.ts` at all (see below).

Four prefixes are proxied to backend services, each stripped before forwarding:

| Prefix | Env var (default) | Backend |
|---|---|---|
| `/api` | `API_URL` (`http://localhost:3000`) | Question Generator API |
| `/reports-api` | `REPORTS_API_URL` (`http://localhost:5082`) | Reports API |
| `/attempt-api` | `ATTEMPT_API_URL` (`http://localhost:5136`) | Attempt API |
| `/agent-api` | `AGENT_API_URL` (`http://localhost:8010`) | Agentic chatbot API |

The proxy is registered **before** static file serving and the Angular request handler in `server.ts` — order matters, since Angular's catch-all would otherwise swallow these routes.

**Two separate places know these same backend URLs and must be kept in sync when a target changes:**
1. `src/server.ts` (`PROXY_ROUTES`) — used when a request actually reaches the Express server (prod/SSR runtime, or any client-side XHR that already resolved to a relative URL).
2. `src/app/interceptors/server-url.interceptor.ts` (`SERVER_URL_MAP`) — rewrites relative `/api`, `/reports-api`, etc. URLs to absolute backend URLs *during SSR only* (`isPlatformServer`), because Angular's `HttpClient` running server-side can't resolve a relative URL against "the current page" the way a browser can.

`npm run dev` (`ng serve`) does **not** run `server.ts` — there is no proxy in that mode. Any environment relying on the `/api` etc. prefixes (including Playwright e2e, which runs against `ng serve`) needs the backend services reachable directly, or the frontend's `environment.ts` API URLs pointed at them directly.

## Auth (Supabase)

`AuthService` (`src/app/services/auth.service.ts`) wraps a Supabase JS client initialized from `environment.supabaseUrl` / `environment.supabaseAnonKey`. Session state lives in browser storage (Supabase's own persistence) and is exposed as a `BehaviorSubject<AppUser | null>` (`currentUser$`).

Two pieces plug into this on every HTTP request:
- `authenticationGuardGuard` (`src/app/authentication-guard-guard.ts`) — route guard; calls `authService.getSession()` and redirects to `/auth/login` if there's no session. Applied to the `/dashboard` route tree via `canActivateChild` in `dashboard.routes.ts`.
- `authInterceptor` (`src/app/interceptors/auth.interceptor.ts`) — attaches `Authorization: Bearer <token>` to requests targeting the Question Generator API or Agent API only (matched by URL prefix/substring). Reports API and Attempt API calls are *not* auto-authenticated by this interceptor.

**Important SSR implication:** because the session lives in browser storage, the guard can never see it during server-side rendering. `app.routes.server.ts` explicitly forces `dashboard/**` and `attempt/**` to `RenderMode.Client` for this reason — don't move auth-gated routes back to server rendering without solving that first.

## Routing structure

- `app.routes.ts` — top-level: `/` (landing, eager), `/dashboard` (lazy, guarded), `/student` (lazy), `/auth` (lazy), `/attempt/:id` (lazy standalone component).
- `dashboard.routes.ts` — nested under `DashboardLayout`: `my-quizzes`, `reports`, `reports/:id`, `settings`, `create-assessment`, `create-assessment/:id`.
- `student.routes.ts` — join-quiz and take-quiz flow, unauthenticated (students don't log in).
- `app.routes.server.ts` controls per-route SSR render mode — check this file before assuming a route is server-rendered.

## Environments

`src/environments/environment.ts` (dev) / `environment.prod.ts` (prod, swapped via `angular.json` `fileReplacements`) hold client-side constants (Supabase URL/anon key, backend base URLs) used by browser-side code and by `server-url.interceptor.ts`. These are compiled into the bundle — they are **not** read from `process.env` at runtime in the browser. Server-side proxying (`server.ts`) and the SSR interceptor, by contrast, read `process.env` directly so Docker/prod can override backend targets without a rebuild. Changing a backend URL for Docker means setting the env var (`API_URL`, etc.) — changing it for local `ng serve` means editing `environment.ts`.

## E2E tests (`e2e/`, Playwright)

- Config: `playwright.config.ts`. Boots **only** the Angular dev server (`npm run dev`) via `webServer` — it does **not** start any backend service. Start those separately (from repo root: `docker compose up`) before running `npm run test:e2e`.
- `e2e/global-setup.ts` logs in once as a real Supabase test teacher account through the actual login form and caches the session to `e2e/.auth/teacher.json`; dashboard specs reuse it via `test.use({ storageState: 'e2e/.auth/teacher.json' })`. Requires `TEST_TEACHER_EMAIL` / `TEST_TEACHER_PASSWORD` — copy `.env.test.example` to `.env.test` and fill in a **dedicated** test account (never a personal/production one). `playwright.config.ts` auto-loads `.env.test` via `dotenv`.
- Two Playwright projects: `chromium` (full suite) and `mobile-chrome` (Pixel 5 viewport, only runs specs tagged `@responsive`, via `grep`).
- Tests are organized by route area under `e2e/tests/` (`auth/`, `dashboard/`, `student/`), each with local `*-helpers.ts` files for shared setup within that area.

## Change detection

The app uses `provideZonelessChangeDetection()` (`app.config.ts`) — no Zone.js. Component state changes must go through signals or otherwise trigger CD explicitly; code relying on implicit zone-based change detection (e.g. a bare `setTimeout` mutating a plain field) won't update the view.
