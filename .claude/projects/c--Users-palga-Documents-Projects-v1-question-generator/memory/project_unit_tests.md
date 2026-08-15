---
name: Angular unit tests completed
description: Angular frontend unit tests written and passing (73/73) — patterns and gotchas for this project
type: project
---

All Angular frontend unit tests for ai-metimeter-client are written and passing (73/73 across 15 spec files).

**Why:** Implementing the unit_test_implementation_plan.md for the full-stack testing initiative.

**How to apply:** When adding new Angular features, follow the same patterns below to add tests.

## Test patterns established

### Services (assessment, auth, quiz, report, theme)
- Uses `provideHttpClient()` + `provideHttpClientTesting()` + `HttpTestingController`
- Supabase mock: `vi.hoisted()` + `vi.mock('@supabase/supabase-js')` (avoids hoisting issues)
- Angular effects (ThemeService): use `TestBed.flushEffects()` after signal changes before asserting DOM

### Guards
- `TestBed.runInInjectionContext(() => guardFn(...))` pattern
- Provide mock AuthService + mock Router

### Interceptors
- `provideHttpClient(withInterceptors([interceptor]))` + `provideHttpClientTesting()`
- Async interceptors (Promise-based): `await Promise.resolve()` before `httpMock.expectOne()`
- SSR interceptor: provide `{ provide: PLATFORM_ID, useValue: 'server' }` to test SSR path

### Components
- Standalone components: `imports: [ComponentClass]` in TestBed
- Components using RouterLink: add `RouterModule.forRoot([])` to imports
- CountdownTimer: `vi.useFakeTimers()` before `fixture.detectChanges()`, `vi.useRealTimers()` in afterEach

## tsconfig.spec.json fix
Added `"node"` to types (needed for `process.env` in server-url.interceptor.ts which is compiled by test build):
```json
"types": ["vitest/globals", "node"]
```

## Component export names
- `FooterComponent` (not `Footer`) — scaffold specs were wrong
- `HeaderComponent` (not `Header`) — scaffold specs were wrong
- App, Landing, LandingHero: class names match file basename

## Vitest globals
`describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach` — all available without imports (globals: true)
`vi.mock()` and `vi.hoisted()` — available globally
`done` callback — NOT available; use `async/await` or `return new Promise<void>(...)`
