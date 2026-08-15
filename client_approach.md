# Client Rendering Approach — ai-metimeter-client

## What is the Current Rendering Mode?

**The app is already configured as full Server-Side Rendering (SSR) with Client Hydration.**

You may have thought it was SSG (Static Site Generation) because SSG and SSR look identical in the browser — both serve HTML that is pre-filled with content. The difference is *when* and *how often* that HTML is generated.

---

## The Three Modes Explained

```
┌──────────────────────────────────────────────────────────────┐
│  CSR — Client-Side Rendering (plain SPA)                     │
│                                                              │
│  Browser → blank HTML shell → download JS → run Angular      │
│         → fetch API → render content                         │
│                                                              │
│  ✓ Simple  ✗ Slow first paint  ✗ Bad for SEO                │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  SSG — Static Site Generation (prerender at build time)      │
│                                                              │
│  ng build → Angular runs routes → writes .html files         │
│  Browser → gets pre-built static HTML from disk/CDN          │
│                                                              │
│  ✓ Instant  ✓ CDN-cacheable  ✗ Data is frozen at build time │
│  ✗ Useless for pages that need live/personalized data        │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  SSR — Server-Side Rendering (render on every request)       │
│                                                              │
│  Browser → Express server → Angular renders HTML server-side │
│         → fetches live API data → sends full HTML to browser  │
│  Browser → gets complete HTML → hydrates (attaches JS)       │
│                                                              │
│  ✓ Fast first paint  ✓ Live data  ✓ Good SEO                │
│  ✗ Slightly higher server load than SSG                      │
└──────────────────────────────────────────────────────────────┘
```

---

## Why SSG Would Be Wrong for This App

SSG fetches API data at *build time* and bakes it into static HTML. Your app has:
- Teacher dashboards showing their own quizzes (personalized)
- Quiz attempt screens (live, per-student)
- Job polling (real-time LLM generation status)
- Auth-gated routes (per-user session)

None of these can be pre-built statically — they depend on who is logged in and what just happened. SSG would have shown the same stale data to every user. SSR is the correct choice.

---

## Current Architecture Map

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  1. Requests any route (e.g. /dashboard)                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Express Server  (src/server.ts)                │
│  Port 4000                                                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Reverse Proxy (built-in, no extra libs)            │   │
│  │  /api/*        → http://question-generator-api:3000 │   │
│  │  /reports-api/* → http://reports-api:5082           │   │
│  │  /attempt-api/* → http://attempt-api:5136           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Angular SSR Engine (AngularNodeAppEngine)          │   │
│  │  • Boots Angular on Node.js                         │   │
│  │  • Runs component lifecycle (ngOnInit etc.)         │   │
│  │  • Makes internal API calls via serverUrlInterceptor│   │
│  │  • Renders HTML string with live data               │   │
│  │  • Sends complete HTML to browser                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  2. Receives full HTML with content already visible         │
│  3. Downloads Angular JS bundle                             │
│  4. Hydrates: Angular attaches to existing DOM              │
│     (withEventReplay: queued clicks fire after hydration)   │
│  5. App is fully interactive                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Configuration Files

### `angular.json` — Build Mode
```json
"outputMode": "server"   // NOT "static" (SSG) — this is SSR
"ssr": { "entry": "src/server.ts" }
```

### `app.routes.server.ts` — Route Render Mode
```typescript
export const serverRoutes: ServerRoute[] = [
  { path: '**', renderMode: RenderMode.Server }  // All routes: SSR
];
```
`RenderMode.Server` = render on every request (live data).  
`RenderMode.Prerender` = render once at build time (SSG).  
`RenderMode.Client` = no server rendering, send blank shell (CSR).

### `app.config.ts` — Hydration
```typescript
provideClientHydration(withEventReplay())
```
After the server sends HTML, Angular reuses the server-rendered DOM instead of throwing it away and re-rendering. `withEventReplay` queues clicks/interactions that happen before hydration completes and replays them.

### `app.config.server.ts` — Server-Only Config
```typescript
provideServerRendering(withRoutes(serverRoutes))
provideHttpClient(withFetch(), withInterceptors([serverUrlInterceptor]))
```

### `interceptors/server-url.interceptor.ts` — The Bridge
During SSR, Angular runs on Node — there is no browser. Relative URLs like `/api/foo` don't work on a Node server (there's no host). This interceptor rewrites them:

```
During SSR only:
  /api/foo          →  http://localhost:3000/foo
  /reports-api/foo  →  http://localhost:5082/foo
  /attempt-api/foo  →  http://localhost:5136/foo
```

On the browser, the interceptor does nothing — relative URLs work fine.

---

## Benefits You Already Get from SSR

| Benefit | How |
|---|---|
| Fast first paint | Browser receives complete HTML, no white flash |
| Content visible before JS loads | Server renders full component tree |
| SEO-friendly | Crawlers see real content, not `<app-root></app-root>` |
| Event replay | Clicks before hydration are not lost |
| Unified proxy | One Express server handles all API routing — no CORS issues in prod |
| Platform-safe code | `isPlatformBrowser()` guards prevent crashes on Node |

---

## What Is Currently Missing (How to Get More)

### 1. TransferState — The Biggest Gap

**Problem:** Right now, the server fetches data from the API and renders HTML. Then the browser receives that HTML, Angular hydrates — and immediately re-fetches the same data from the same API. Every SSR page load results in **two identical API calls**: one on the server, one on the browser.

```
Current flow:
  Server → GET /api/assessments → renders HTML
  Browser → receives HTML (data already visible)
  Browser hydrates → GET /api/assessments AGAIN (data re-fetched, UI flickers)
```

**Fix: Use `TransferState`** to serialize server-fetched data into the HTML and rehydrate it on the browser without re-fetching.

```typescript
// In a service, using the cache pattern:
import { TransferState, makeStateKey } from '@angular/core';

const ASSESSMENTS_KEY = makeStateKey<Assessment[]>('assessments');

getAssessments() {
  const cached = this.transferState.get(ASSESSMENTS_KEY, null);
  if (cached) {
    this.transferState.remove(ASSESSMENTS_KEY);
    return of(cached);
  }
  return this.http.get<Assessment[]>('/api/assessments').pipe(
    tap(data => {
      if (isPlatformServer(this.platformId)) {
        this.transferState.set(ASSESSMENTS_KEY, data);
      }
    })
  );
}
```

Affected services: `AssessmentService`, `QuizService`, `ReportService`.

---

### 2. Per-Route Render Mode Optimization

Not every page needs full SSR on every request. You can mix strategies per route:

```typescript
export const serverRoutes: ServerRoute[] = [
  // Landing page: prerender once at build — it's fully static
  { path: '', renderMode: RenderMode.Prerender },

  // Auth pages: no SSR needed, ship blank shell
  { path: 'auth/**', renderMode: RenderMode.Client },

  // Dashboard/Attempt: live data, must be SSR
  { path: 'dashboard/**', renderMode: RenderMode.Server },
  { path: 'attempt/:id', renderMode: RenderMode.Server },
  { path: 'student/**', renderMode: RenderMode.Server },
];
```

This reduces server load for pages that don't benefit from SSR.

---

### 3. Direct `fetch()` Bypasses SSR Interceptor

In `CreateAssessment`, file uploads and generation requests use native `fetch()` directly:

```typescript
// This bypasses the serverUrlInterceptor — works on browser, breaks on SSR
const response = await fetch('/api/file-upload', { method: 'POST', body: formData });
```

These particular calls happen only after user interaction (file upload button click), so they never run on the server. But as a pattern, raw `fetch()` in Angular SSR apps is risky. Prefer `HttpClient` so the interceptor can rewrite URLs when needed.

---

### 4. No HTTP Caching Headers

The Express server serves the SSR-rendered HTML with no cache-control headers. For pages like the landing page, you could add:

```typescript
res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
```

This lets a CDN (Cloudflare, Vercel, etc.) cache the rendered HTML for 60 seconds.

---

## Summary: Current State vs. Ideal State

```
┌─────────────────────────────┬──────────────┬────────────────────────────┐
│ Feature                     │ Current      │ Ideal                      │
├─────────────────────────────┼──────────────┼────────────────────────────┤
│ Rendering mode              │ SSR ✓        │ SSR ✓                      │
│ Hydration                   │ Enabled ✓    │ Enabled ✓                  │
│ Event replay                │ Enabled ✓    │ Enabled ✓                  │
│ Server-side URL rewriting   │ Enabled ✓    │ Enabled ✓                  │
│ API reverse proxy           │ Enabled ✓    │ Enabled ✓                  │
│ Platform guards             │ Present ✓    │ Present ✓                  │
│ TransferState (no re-fetch) │ MISSING ✗    │ Add to all services        │
│ Per-route render mode       │ All SSR      │ Mix SSG/CSR/SSR per route  │
│ HTTP response caching       │ MISSING ✗    │ Cache-Control headers      │
│ HttpClient for all requests │ Partial ✗    │ Replace fetch() calls      │
└─────────────────────────────┴──────────────┴────────────────────────────┘
```

The app is already well-configured for SSR. The highest-impact improvement is adding **TransferState** to eliminate double API calls on every page load.
