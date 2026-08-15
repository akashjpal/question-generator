# E2E Failure/Flake Triage

Source: full Playwright run, 8/6/2026 12:58:17 PM (headed, 1 worker), 27.2m total.
87 tests → 63 passed, 19 failed, 5 flaky, 3 skipped.

Fixed via 7 parallel agents (one per component, no file overlap) + a coordinator review/fix
pass for backend + test-authoring bugs the agents surfaced. Verifying with a full clean e2e
re-run now. Original diagnoses below are left in place where a fix changed the actual root
cause found — several turned out different from the initial guess.

---

## HARD (untouched — need your input)

### H1. Public student join flow is 401'd for every anonymous student — 9 failing tests
**Status: not started, needs your decision.** `AttemptScreen.loadAssessment()`
(`attempt.ts:87`) calls `GET /api/assessments/:id`, guarded by `requireAuth` on the backend —
but `/attempt/:id` is public/unauthenticated, so real students always 401. The same response
also carries the correct answers + access code, compared client-side. Needs a real design
call (new public-safe endpoint vs. reshaped join flow) before touching backend auth.
- [ ] Decide approach — new public endpoint vs. redesigned join flow
- [ ] Implement + strip sensitive fields from any public response
- [ ] Re-run `student/attempt-flow.spec.ts`

### H2. Agentic-mode quiz creation never renders a published-quiz-card (100s timeout)
**Status: not started.** Depends on the live `ai-agent-chatbot` LLM pipeline.
- [ ] Check `ai-agent-chatbot` logs during a live run; confirm LLM provider/quota is valid

---

## MEDIUM

### M1. `dashboard-layout.spec.ts:40` — sidenav `.menu-toggle` missing at handset viewport (chromium project only)
**[x] Fixed — was a test bug, not an app bug.** Investigation confirmed `dashboard-layout.ts`
already uses `BreakpointObserver` + `| async` correctly (zoneless-safe). The actual gap: the
`@responsive`-tagged test never calls `page.setViewportSize()` — it only ever passed on the
`mobile-chrome` project's device emulation, and was guaranteed to fail on `chromium`'s desktop
viewport (1280×720, never satisfies `Breakpoints.Handset`). Added an explicit
`page.setViewportSize({width: 375, height: 667})` in `dashboard-layout.spec.ts:40`.

### M2. `my-quizzes.spec.ts:66` — "View Report" stays disabled after a real attempt exists
**[x] Fixed — real backend bug, confirmed (not the suspected timing issue).**
`getAllAssessmentsForUser()` (`question-generator-api-ts/helpers/supabseOperator.ts`) never
selected `attemptsCount` at all — it isn't a column on `assessment_table`; attempts live in
`AssessmentResult` (owned by AttemptAPI/.NET), with no FK PostgREST can auto-embed. Added a
second query grouped in JS to compute `attemptsCount` per assessment and merge it in.

### M3. `my-quizzes.spec.ts:90` — publishing a draft doesn't flip the card to "Published"
**[x] Fixed — real backend bug, confirmed (not a race, as originally guessed).** The
`/api/assessments/:id/publish` handler (`index.ts:173`) had its actual publish call commented
out (`// await publisher.handleAssessmentPublishing(assessment);`) — it fetched the
assessment, logged it, and returned success while writing nothing. Found the purpose-built
`Publisher.updateAssessmentStatus(id)` method already existed but was unused *and* itself
buggy: it wrote the string `'published'` into a column the rest of the app treats as the
numeric `AssessmentStatus.published = 1` (so `my-quizzes.ts`'s `item.status === 1` check would
never match even if called), and had no `.select()` so it always returned `undefined`. Fixed
both: `updateAssessmentStatus()` now writes `AssessmentStatus.published` and selects the row;
the route now actually calls it.

### M4. `auth/signup.spec.ts:46` — successful signup doesn't redirect or show confirmation banner
**Status: investigated, no code bug found — left as-is.** `signup.ts`/`AuthService.signup()`
correctly handle both branches (session → redirect; no session → confirmation banner) and
surface errors to `#signup-error` rather than swallowing them. Likely a Supabase-project-side
rejection (domain restriction, CAPTCHA, rate limit) for the test's throwaway email, not
checked by the test. Needs a manual repro against the real Supabase project to confirm.
- [ ] Manually reproduce signup against the real Supabase project, check `#signup-error` content

### M5. `dashboard/agent-chat.spec.ts:12` — composer/empty-message-list doesn't render
**Status: investigated, no frontend bug found — needs a test-infra decision.**
`message-list.html`'s `.empty-state` gating (`bubbles().length === 0`) and all of
`agent-chat.ts`'s async state are correctly signal-driven (already zoneless-safe, no
`detectChanges()` needed). Real cause: `AgentChat.initSession()` resumes any session with
`status === 'active'`, and the app never marks a session `completed`/`archived` after a turn
— so once ANY test sends a message on the shared teacher account, that session stays "active"
forever. Combined with `playwright.config.ts`'s `fullyParallel: true` and all `agent-chat`
tests sharing one `teacher.json` storageState, this test can non-deterministically resume a
different test's populated session instead of starting empty.
- [ ] Decide: give agent-chat tests isolated sessions/accounts, or have the app archive
      sessions after each turn (product question, not obviously a "bug" either way)

### M6 (flaky). `create-assessment.spec.ts:161` — Edit mode update, passes on retry
**[x] Fixed — real bug found, different from the original guess.** `loadAssessment()`'s
existing `detectChanges()` already covered its state correctly. The actual bug:
`updateAssessment()` was declared `async` but never awaited its `.subscribe(...)` — so
`await this.updateAssessment()` in `publishAssessment()` was a no-op, letting the
success-snackbar/navigation fire before the backend PUT actually completed, racing the
my-quizzes reload against the write. Fixed with `firstValueFrom` so it genuinely awaits and
surfaces errors into the existing `try/catch` (previously silently swallowed via
`console.error` only).

---

## EASY

### E1. Duplicate `id="features"` on the landing page
**[x] Fixed.** Removed the `id` from the outer wrapper `<section>` in `landing.html`; kept it
on the real content section in `landing-features.html`. Nav-anchor scroll target confirmed
unaffected. (Noted in passing: `#pricing` has the same outer/inner duplicate-id pattern but
isn't currently asserted by a test — worth a look separately.)

### E2. `data-testid="correct-radio-i-j"` sits on the wrong DOM element
**[x] Fixed.** Confirmed via Angular Material 21 source that `mat-radio-button` never forwards
attributes to its internal `<input>` — template-only binding genuinely can't reach it. Added a
`ViewChildren` + `Renderer2` sync in `create-assessment.ts` that stamps the real `data-testid`
onto each radio's actual native `<input>` at view-init and whenever radios are added
dynamically, via an intermediate `data-radio-testid` marker attribute in the template.

### E3. Password-strength meter shows all requirements "met" for a weak password
**[x] Fixed — was a test bug, not an app bug.** All four strength-check getters in `signup.ts`
were verified correct against the exact test literals (weak → all false, strong → all true).
The real defect: `signup.spec.ts` used `locator.filter({ hasClass: 'met' })`, which isn't a
real Playwright API (`filter()` only supports `has`/`hasNot`/`hasText`/`hasNotText`/`visible`)
— it silently no-op'd and returned all 4 pills regardless of state. Fixed both affected
assertions (weak- and strong-password tests) to use `.requirement.met` as a direct locator.

### E4. `AttemptScreen.loadAssessment()` has no error handler — bad ID spins forever
**[x] Fixed.** Added an `error` callback to `loadAssessment()`'s subscribe that sets the
existing `error` property + flips `isLoading` false + calls `detectChanges()`, so the
already-existing error-card branch in `attempt.html` (previously unreachable) now renders.

### E5 (flaky). `assessment-report.spec.ts:31` — stat-participants briefly reads "0"
**[x] Fixed.** Extracted the stats fetch into `fetchStats(isInitialLoad)`; on the very first
load only, if `participants === 0`, schedules exactly one retry 1.5s later (guarded so it
never loops), reusing the existing fetch/apply path without touching the separate
user-facing "Auto Refresh" toggle state.

### E6 (flaky). `my-quizzes.spec.ts:54` — copy-code click intercepted by menu overlay backdrop
**[x] Fixed — was a test bug, not an app bug.** Confirmed `copy-code-btn` is a standalone card
button (`my-quizzes.html:163`), not a `mat-menu-item` — the test's `card-menu-btn` click was
copy-paste leftover from the neighboring "create attempt link" test (which correctly needs the
menu open, since that action genuinely is a menu item). Removed the stray menu-open step.

### E7 (flaky). `my-quizzes.spec.ts:155` — empty-state not immediately visible
**Investigated, no gap found.** `setFilter()` fires synchronously from a template `(click)`,
which zoneless CD picks up correctly; no missing `detectChanges()` found. Left unchanged —
re-check after the full suite re-run in case it was actually downstream of E6/M3.

### E8 (flaky, low priority). `student-mock-routes.spec.ts:28`
**Investigated, no fix applied — awaiting your call.** `TakeQuiz`'s question data and nav
state are synchronous with no async race found. This spec's own `describe()` explicitly calls
the route "dead UI, not backend-integrated." Left alone per instructions (not deleting a route
autonomously).
- [ ] Decide: fix the flake anyway, or delete the dead mock-route UI + its spec

---

## Also touched (backend)

- `question-generator-api-ts/helpers/publisher.ts` — `updateAssessmentStatus()` status-value +
  missing-`.select()` bugs (part of M3)
- `question-generator-api-ts/index.ts` — `/api/assessments/:id/publish` now actually calls the
  publish (part of M3)
- `question-generator-api-ts/helpers/supabseOperator.ts` — `attemptsCount` computation added
  (part of M2)

## Remaining open items

- [ ] **M4** — manual repro needed
- [ ] **M5** — product decision needed (test isolation vs. session-archiving)
- [ ] **E8** — product decision needed (fix vs. delete dead mock UI)
- [ ] **H1** — your design decision needed (biggest win, 9 tests)
- [ ] **H2** — needs live LLM-pipeline debugging
