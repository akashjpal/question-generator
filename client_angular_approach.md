# Client Angular Approach

## TO-DO List

1. Confirm the current Angular rendering mode.
   - Check `ai-metimeter-client/angular.json`.
   - Current result: the app is configured with `outputMode: "server"`, so the build target is SSR, not static-only SSG.

2. Confirm the Angular server entry files.
   - Check `src/main.server.ts`.
   - Check `src/server.ts`.
   - Current result: both files exist and are wired for Angular SSR with an Express server.

3. Confirm route rendering behavior.
   - Check `src/app/app.routes.server.ts`.
   - Current result: every route uses `RenderMode.Server`.
   - Meaning: all routes are rendered on the server for each request.

4. Confirm hydration behavior.
   - Check `src/app/app.config.ts`.
   - Current result: `provideClientHydration(withEventReplay())` is enabled.
   - Meaning: Angular reuses the server-rendered HTML in the browser and then attaches interactivity.

5. Confirm server-only providers.
   - Check `src/app/app.config.server.ts`.
   - Current result: `provideServerRendering(withRoutes(serverRoutes))` is configured.
   - Current result: server-side `HttpClient` uses `serverUrlInterceptor`.

6. Confirm API URL strategy.
   - Check `src/environments/environment.ts`.
   - Check `src/environments/environment.prod.ts`.
   - Check `src/app/interceptors/server-url.interceptor.ts`.
   - Current result: development uses direct localhost API URLs; production uses relative URLs like `/api`, `/reports-api`, and `/attempt-api`.

7. Confirm deployment strategy.
   - Check `ai-metimeter-client/Dockerfile`.
   - Check root `docker-compose.yml`.
   - Current result: the frontend container runs Node SSR on port `4000`, exposed as host port `4200`.

8. Identify pages that benefit from SSR.
   - Landing page benefits from fast first paint and SEO.
   - Attempt pages can benefit from server-rendered assessment data.
   - Dashboard pages can benefit from server-rendered initial data, but only if auth/session handling is SSR-safe.

9. Identify pages that do not need SSR.
   - Login, signup, forgot password, settings, file upload, quiz interaction, and clipboard-only flows do not gain much from SSR.
   - These can be client-rendered if server load becomes a concern.

10. Fix browser-only code before relying heavily on SSR.
    - Guard direct usage of `localStorage`, `window`, `document`, `navigator`, `alert`, `confirm`, and clipboard APIs.
    - Use `isPlatformBrowser()` when code can run during server rendering.

11. Add TransferState for API-backed pages.
    - Server-rendered API data should be passed to the browser.
    - This avoids fetching the same data once on the server and again after hydration.

12. Decide route-by-route rendering modes.
    - Use SSR for dynamic public or route-data pages.
    - Use prerender/SSG for static marketing pages.
    - Use client rendering for browser-only authenticated flows.

13. Add response caching where safe.
    - Static or semi-static pages can use cache headers.
    - Personalized dashboard or attempt pages should not be publicly cached.

14. Verify the behavior.
    - Run `npm run build` inside `ai-metimeter-client`.
    - Run `npm start` inside `ai-metimeter-client`.
    - Visit routes directly, for example `/`, `/dashboard/my-quizzes`, and `/attempt/:id`.
    - View page source to confirm whether meaningful HTML is present before JavaScript hydration.

## Short Answer

Your client was probably SSG or SPA-style earlier, but the current Angular client is already configured for SSR.

The important difference is this:

- SSG creates HTML at build time.
- SSR creates HTML at request time.
- CSR/SPA sends a mostly empty shell and lets the browser render everything after JavaScript loads.

Because your app depends on APIs, live quiz data, attempt state, reports, generated assessments, and user-specific dashboard data, pure SSG is not a good fit for most of the app. SSR is useful where the server can fetch the current data and return useful HTML immediately.

## Current Approach in This Codebase

The Angular client lives here:

```text
ai-metimeter-client/
```

The current approach is Angular SSR with hydration and an Express server.

The key files are:

```text
ai-metimeter-client/angular.json
ai-metimeter-client/src/main.ts
ai-metimeter-client/src/main.server.ts
ai-metimeter-client/src/server.ts
ai-metimeter-client/src/app/app.config.ts
ai-metimeter-client/src/app/app.config.server.ts
ai-metimeter-client/src/app/app.routes.ts
ai-metimeter-client/src/app/app.routes.server.ts
ai-metimeter-client/src/app/interceptors/server-url.interceptor.ts
ai-metimeter-client/Dockerfile
docker-compose.yml
```

## What `angular.json` Says

In `angular.json`, the build config uses:

```json
"outputMode": "server"
```

It also defines:

```json
"browser": "src/main.ts",
"server": "src/main.server.ts",
"ssr": {
  "entry": "src/server.ts"
}
```

That means Angular builds both:

- a browser bundle for hydration and client-side interaction
- a server bundle for request-time HTML rendering

This is SSR configuration.

It is not pure SSG, because SSG would usually use prerender/static output where pages are generated during the build and served as files.

## What `app.routes.server.ts` Says

Current server route configuration:

```ts
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Server
  }
];
```

This means every route is currently server-rendered.

Examples:

```text
/                         -> SSR
/dashboard/my-quizzes     -> SSR
/dashboard/reports        -> SSR
/auth/login               -> SSR
/student/join             -> SSR
/attempt/:id              -> SSR
```

This is simple and consistent, but it may be more SSR than the app actually needs.

## What Happens During SSR

Current request flow:

```text
Browser requests /attempt/123
        |
        v
Node Express server receives the request
        |
        v
Angular SSR runs the Angular app on the server
        |
        v
Angular components run initial lifecycle code
        |
        v
HttpClient calls can fetch API data from backend services
        |
        v
Angular renders HTML on the server
        |
        v
Browser receives HTML with content already present
        |
        v
Browser downloads JavaScript
        |
        v
Angular hydrates the page and makes it interactive
```

Hydration is enabled in `app.config.ts`:

```ts
provideClientHydration(withEventReplay())
```

This means Angular does not throw away the server-rendered HTML. It attaches Angular behavior to the existing DOM.

`withEventReplay()` also helps preserve user interactions that happen before hydration finishes.

## Why Your API Usage Changes the Decision

SSG works best when data is known at build time.

Examples where SSG is good:

- static landing page
- documentation
- pricing page with fixed content
- marketing pages
- public pages that change rarely

Your app has many pages where data is not known at build time:

- teacher dashboard quizzes
- reports and assessment stats
- quiz attempt by assessment ID
- generated assessment status
- saved attempts
- submitted quiz results
- authenticated user state

For these pages, SSG can become stale or incorrect because the HTML is generated before the user even visits the page.

SSR is better when the server needs to render the latest version of a route for the incoming request.

## How SSR Helps This App

SSR helps in these ways:

1. Faster first visible page.
   - The browser receives actual HTML instead of waiting for Angular JavaScript to load first.

2. Better direct-route loading.
   - A user can open `/attempt/:id` directly and still get a real page from the server.

3. Better SEO for public pages.
   - Crawlers see rendered content instead of an empty Angular shell.

4. Better link previews for public pages.
   - If you later add route-specific metadata, SSR can help social previews and crawlers read it.

5. Better perceived performance.
   - The page can show meaningful structure before hydration completes.

6. Easier production API routing.
   - The Express server proxies `/api`, `/reports-api`, and `/attempt-api` to backend services.
   - This avoids exposing internal Docker service names to the browser.

7. Better fit for live route data than SSG.
   - Attempt pages and report pages can be generated with current data.

## What SSR Does Not Automatically Solve

SSR is not magic. It does not automatically make every API page optimal.

Current important gaps:

1. The browser may refetch data after hydration.
   - If a page fetches data on the server, Angular may fetch it again in the browser.
   - This creates duplicate API calls.
   - Fix: use Angular `TransferState`.

2. Browser-only APIs can crash during SSR.
   - Examples: `window`, `document`, `navigator`, `localStorage`, `alert`, `confirm`.
   - These APIs do not exist on the Node server.
   - Fix: wrap browser-only code in `isPlatformBrowser()` checks.

3. Auth state is currently browser-storage based.
   - `AuthService` reads tokens from `localStorage`.
   - Server rendering cannot read browser `localStorage`.
   - If authenticated pages need real SSR, auth should move toward cookies or another server-readable session strategy.

4. SSR increases server work.
   - SSG can serve static files cheaply.
   - SSR runs Angular on the server per request.
   - Fix: use route-level render modes and cache headers where safe.

## Current API Approach

Production environment values:

```ts
questionGeneratorApiUrl: '/api'
reportsApiUrl: '/reports-api'
attemptApiUrl: '/attempt-api'
```

Development environment values:

```ts
questionGeneratorApiUrl: 'http://localhost:3000'
reportsApiUrl: 'http://localhost:5082'
attemptApiUrl: 'http://localhost:5136'
```

During SSR, relative API URLs need special handling because server-side Angular runs in Node, not in the browser.

That is why `server-url.interceptor.ts` exists.

It rewrites server-side requests like this:

```text
/api/...          -> API_URL
/reports-api/...  -> REPORTS_API_URL
/attempt-api/...  -> ATTEMPT_API_URL
```

In Docker, those become:

```text
/api/...          -> http://question-generator-api:3000/...
/reports-api/...  -> http://reports-api:5082/...
/attempt-api/...  -> http://attempt-api:5136/...
```

The browser still calls relative URLs. The Express server proxies those requests to the right backend service.

## Current Deployment Approach

The frontend Dockerfile builds Angular and then runs the SSR server:

```text
node dist/ai-quick-analysis/server/server.mjs
```

The root `docker-compose.yml` maps:

```text
host port 4200 -> frontend container port 4000
```

So the browser opens:

```text
http://localhost:4200
```

But the Angular SSR server inside the container listens on:

```text
http://localhost:4000
```

The old Nginx SPA config still exists as `nginx-spa.conf`, but the active Dockerfile is Node SSR, not Nginx static SPA hosting.

## Recommended Route Strategy

The current setup renders everything with SSR. That is acceptable as a starting point, but you can get more out of Angular by choosing the render mode per route.

Recommended future route split:

```ts
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'auth/**', renderMode: RenderMode.Client },
  { path: 'dashboard/create-assessment/**', renderMode: RenderMode.Client },
  { path: 'dashboard/settings', renderMode: RenderMode.Client },
  { path: 'dashboard/my-quizzes', renderMode: RenderMode.Server },
  { path: 'dashboard/reports', renderMode: RenderMode.Server },
  { path: 'dashboard/reports/:id', renderMode: RenderMode.Server },
  { path: 'attempt/:id', renderMode: RenderMode.Server },
  { path: 'student/**', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server }
];
```

Why:

- Landing page can be prerendered because it is mostly static.
- Auth pages are mostly forms and do not need SSR.
- Create-assessment has uploads, polling, and user interaction, so client rendering is enough.
- Dashboard reports and quiz lists can use SSR if auth is made server-safe.
- Attempt page can use SSR because the assessment ID is in the route and initial assessment data can be fetched server-side.

## Biggest Improvement: TransferState

Without `TransferState`, this can happen:

```text
Server renders /dashboard/reports
Server calls Reports API
Server sends HTML to browser
Browser hydrates
Browser calls Reports API again
```

That means duplicate API calls.

The better flow:

```text
Server renders /dashboard/reports
Server calls Reports API
Server stores the result in TransferState
Server sends HTML plus serialized data
Browser hydrates
Browser reads TransferState
Browser does not repeat the same first API call
```

Use this especially in:

```text
AssessmentService.getAllAssessments()
AssessmentService.getAssessment(id)
ReportService.getDashboardStats()
ReportService.getDashboardStatsOfAssessment(id)
```

## Browser-Only Code to Review

These are important before making more pages depend on SSR:

```text
AuthService
- uses localStorage

ThemeService
- already guards browser-only theme code with isPlatformBrowser()

AssessmentService.pollGenerationStatus()
- uses navigator.onLine
- uses window online event

AttemptScreen
- uses localStorage
- uses alert

MyQuizzes
- uses window.location
- uses navigator.clipboard
- uses alert and confirm

AssessmentReport
- uses document.createElement()
- uses document.body
```

These are not always bugs, because many of these run only after user interaction in the browser. But if any of this runs during server rendering, it can fail.

## Should You Convert SSG to SSR?

For this app: yes, for the dynamic parts.

But the better answer is not "everything should be SSR forever." The better answer is hybrid rendering:

- Use SSG/prerender for static public pages.
- Use SSR for public or route-driven pages that need live data.
- Use CSR/client rendering for heavily interactive browser-only flows.

Your current setup is already SSR for all routes. The next improvement is to make it smarter route by route.

## How to Get More Out of SSR

1. Add `TransferState`.
   - This is the highest-impact improvement.
   - It avoids duplicate first-load API calls.

2. Make SSR-safe services.
   - Guard browser-only APIs.
   - Avoid `localStorage` in constructors unless guarded.

3. Use server-readable auth if you want authenticated SSR.
   - For true SSR dashboards, prefer HTTP-only cookies over only `localStorage` tokens.

4. Add route-specific metadata.
   - Title and description can improve SEO and previews.
   - Useful for landing pages and public attempt links.

5. Split render modes by route.
   - Do not SSR pages that cannot use it.
   - Prerender static pages.
   - Client-render browser-only workflows.

6. Add safe cache headers.
   - Cache landing/prerendered content.
   - Do not publicly cache user-specific pages.

7. Prefer `HttpClient` over raw `fetch()` in Angular app code.
   - `HttpClient` can participate in interceptors and SSR behavior.
   - Raw `fetch()` is fine for browser-only event handlers, but it is easier to make SSR mistakes.

## Final Current-State Summary

Current state:

```text
Rendering mode: Angular SSR
Hydration: enabled
Event replay: enabled
Server route mode: all routes use RenderMode.Server
Server runtime: Node Express
API proxy: built into src/server.ts
Docker frontend: runs SSR server, not static Nginx SPA
Biggest missing optimization: TransferState
Biggest SSR risk: browser-only APIs and localStorage auth
Best next architecture: hybrid SSR + SSG + CSR per route
```

The app is already converted to SSR at the framework and deployment level. The main work now is to make the data flow and route strategy take full advantage of SSR.
