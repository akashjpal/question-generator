# RCA: Authenticated Dashboard Routes Bounce Back to Login on Direct Navigation / Refresh

**Date:** 2026-08-06
**Component:** `ai-metimeter-client/src/app/authentication-guard-guard.ts`, `ai-metimeter-client/src/app/services/auth.service.ts`, `ai-metimeter-client/src/app/app.routes.server.ts`

## Symptom

Reported as: logging in with `TEST_TEACHER_EMAIL` "doesn't work" / gets stuck, and the create-assessment → generate-questions flow never runs. In practice: the login form itself succeeds every time, but any direct navigation, hard refresh, or fresh browser session hitting a `/dashboard/**` URL bounces straight back to `/auth/login`, even though a perfectly valid Supabase session exists. This looks like "login is broken" because the user (or an automated test using a stored session) keeps landing back on the login screen.

Reproduced with a scripted Playwright session carrying a valid, non-expired Supabase session in `localStorage` (via `storageState`): navigating to `http://localhost:4200/dashboard/create-assessment` immediately issues a **second top-level HTTP GET to `/auth/login`** before any client JS chunk has loaded — i.e. the redirect happens during server rendering, not after hydration.

## Root Cause

1. `angular.json` builds this app with `outputMode: "server"` and an SSR entry (`src/server.ts`), and Angular's new `@angular/build:application` dev-server runs that same SSR path under plain `ng serve` — this is not CSR-only in dev.
2. `app.routes.server.ts` renders **every** route, including `/dashboard/**`, with `RenderMode.Server`:
   ```ts
   export const serverRoutes: ServerRoute[] = [
     { path: '**', renderMode: RenderMode.Server }
   ];
   ```
3. `AuthService` (`auth.service.ts`) creates a plain browser Supabase client (`createClient(...)`) with no platform check, and persists sessions the default Supabase way: `localStorage`.
4. `authenticationGuardGuard` calls `authService.getSession()` → `supabase.auth.getSession()`, which reads from that `localStorage`.
5. On the server, during SSR, there is no `localStorage` — Supabase's storage adapter has nothing to read, so `getSession()` resolves to `null` **regardless of whether the browser genuinely has a valid session**. The guard then does `router.createUrlTree(['/auth/login'])`, which for an SSR-rendered navigation produces a real redirect response, not a client-side route swap.

Net effect: any time the dashboard is the *first* route rendered for a request (typed URL, refresh, new tab, a test that restores `storageState` and navigates directly, a bookmark) — the server-rendered guard fails before the client ever gets a chance to read its own `localStorage` session. Login only "sticks" when the user stays within a single client-side navigation session started from `/auth/login` (guard never re-runs server-side because there's no full page reload).

This is a known class of bug when mixing Angular SSR/hydration with a `localStorage`-backed auth client — the server literally cannot see client-only storage.

## Why It Looks Like "Login Doesn't Work"

- Global setup / manual login via the form works (`POST` to Supabase succeeds, `router.navigate(['/dashboard'])` fires client-side, no reload → guard doesn't re-run on the server).
- Any subsequent hard navigation (test opening a fresh page with a stored session, a real user refreshing, deep-linking, opening a new tab) re-triggers SSR for `/dashboard/**`, the guard fails server-side, and the user is thrown back to `/auth/login` — so it reads as "logging in over and over" / "stuck at login."
- The e2e "real question generation" spec never reaches Step 1 because `test.use({ storageState: ... })` + `page.goto('/dashboard/create-assessment')` is exactly the failure path above: `[data-testid="title-input"]` never appears because the page redirected to `/auth/login`.

## Fix

Auth-gated app routes have no SEO/SSR value (they're behind a login wall) and depend entirely on client-only session state, so they should not be server-rendered at all. Render them client-side instead, so the guard only ever runs in the browser where `localStorage` is available:

```ts
// app.routes.server.ts
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'dashboard/**', renderMode: RenderMode.Client },
  { path: 'attempt/**', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server }
];
```

(`/auth/**` and `/student/**` can stay server-rendered — they don't run the guard.)

## To-Do

- [x] Ultrathink + reproduce root cause with a scripted Playwright session (confirmed: SSR-time guard redirect, not a credential/login-form bug)
- [ ] Add `dashboard/**` (and `attempt/**`, which also reads client-only state) as `RenderMode.Client` in `app.routes.server.ts`
- [ ] Re-run `npx playwright test -g "uploading a PDF and generating produces real questions"` to confirm Step 1 now loads and generation proceeds
- [ ] Manually verify: hard refresh on `/dashboard/my-quizzes` while logged in no longer bounces to `/auth/login`
- [ ] Clean up scratch repro script (`e2e/repro.js`)

## Expected Result After Fix

- A hard refresh or direct navigation to any `/dashboard/**` URL with a valid session stays on that page instead of redirecting to `/auth/login`.
- The Playwright e2e suite (including the LLM-backed question-generation spec) proceeds past Step 1 instead of timing out on `[data-testid="title-input"]`.
