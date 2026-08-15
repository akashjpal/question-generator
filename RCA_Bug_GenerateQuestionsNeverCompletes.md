# RCA: "Generate Questions" Never Produces Questions / UI Gets Stuck

**Date:** 2026-08-06
**Component:** `ai-metimeter-client/src/app/pages/dashboard/create-assessment/create-assessment.ts` + `.html`

Two independent bugs compounded to make the create-assessment flow look completely broken end-to-end. Found via a live Playwright run against the real stack (Docker-built frontend, real question-generator-api/worker, real Supabase) after the separate [[RCA_Bug_SSRAuthRedirectLoop]] fix unblocked reaching this screen at all.

## Bug 1 — `fileId` race: upload vs. generate click

`onFileSelected()` kicks off `uploadFile()`, an async function that only sets `this.fileId` after its `fetch('/file-upload')` round-trip resolves. Nothing blocked the "Generate Questions" button from being clicked before that resolved. A fast click (a real user double-clicking, or Playwright's scripted `setInputFiles()` + immediate `.click()`) fired `generateQuestions()` with `this.fileId` still `''`.

That empty string was forwarded verbatim, uncorrected, through every hop:
- `create-assessment.ts` → `POST /generate-questions` body `{ fileId: '' , ... }`
- `question-generator-api-ts/index.ts:71` → forwarded into the job payload dispatched to the worker
- `question-generator-worker/main.py` → `GenerateJobRequest.fileId` accepted the empty string with no validation
- worker's `download_file("")` → Supabase Storage request to `.../question-generator-content/` (empty key) → `StorageApiError: Invalid key`
- job status flipped to `3` (FAILED) within ~150ms of being picked up

**Fix:** `onFileSelected()` now stores the upload's promise (`fileUploadPromise`, assigned synchronously before any `await` so a fast click can still find it). `generateQuestions()` awaits that promise before building the request body, so `fileId` is guaranteed populated.

## Bug 2 — zoneless change detection never repainted the button

This app uses `provideZonelessChangeDetection()` (`app.config.ts`). Under zoneless CD, Angular only schedules a re-render on signal writes, `ChangeDetectorRef.markForCheck()`/`detectChanges()`, async-pipe emissions, or the *synchronous* portion of a template-bound event handler. A plain instance-property mutation made inside a `.then()`/`await`-continuation that resumes later (e.g. after a `fetch()` settles) is invisible to the framework unless something explicitly re-triggers CD.

`generateQuestions()` already followed the codebase's established pattern for this component — explicit `this.cdr.detectChanges()` calls after every async state change (on generation success, failure, and the catch-all). `uploadFile()` (added for Bug 1's fix) set `isUploading = true` / `= false` around its `fetch()` but never called `detectChanges()`. Net effect: `isUploading` genuinely flipped back to `false` in memory (confirmed — `fileId` derived from it was correctly present in subsequent autosave payloads), but the `[disabled]="isGenerating || isUploading"` binding on the Generate button never re-evaluated in the DOM, so the button stayed permanently disabled after any file upload — a real user would see "Uploading..." forever.

**Fix:** added `this.cdr.detectChanges()` right after `isUploading = true` and inside `uploadFile()`'s `finally` block, matching the pattern already used elsewhere in this same component.

## Bug 3 — unrelated: Step 2 → Step 3 button permanently disabled (pre-existing, not caused by Bugs 1/2)

`create-assessment.html`:
```html
<button mat-raised-button color="primary" matStepperNext disabled="isGenerating">Next: Preview</button>
```
Missing the property-binding brackets — `disabled="isGenerating"` sets a literal, permanently-truthy HTML attribute, not a binding to the `isGenerating` field. The button was disabled unconditionally, for every user, always. (The e2e suite's own `student-helpers.ts` already had a comment documenting this exact bug and working around it by clicking the stepper's tab header directly instead of the button — this predates the current session.)

**Fix:** `[disabled]="isGenerating"`.

## Verification

- Live-reproduced Bug 1+2 via a scripted Playwright session hitting the real Docker-built frontend + backend (not mocked): confirmed `Invalid key` in `fastapi-worker` logs before the fix, and confirmed the Generate button staying `disabled="true"` for the full 120s test timeout after fixing Bug 1 alone (Bug 2 not yet fixed at that point) — proving Bug 2 was real and independent, not a flake.
- After both fixes + rebuild: `npx playwright test -g "uploading a PDF and generating produces real questions"` — **passed in 24.3s**, real LLM call included.
- Full suite (`npx playwright test --project=chromium`) went from 50/87 passing (pre-fix, measured on an unrelated concurrent run) to **66/88 passing** post-fix. The stepper-binding fix (Bug 3) alone collapsed a ~12-test failure cluster across `assessment-report.spec.ts`, `create-assessment.spec.ts`, and `my-quizzes.spec.ts` down to 1 flaky (passes on retry).

## Related, NOT fixed here — see final chat report for full list

Most notably: `student/attempt-flow.spec.ts` (9 tests) fails because the public, unauthenticated `/attempt/:id` join screen calls `AssessmentService.getAssessment()` → `GET /api/assessments/:id`, which requires `requireAuth` on the backend — so anonymous students always get 401. That response also includes the correct answers and access code (compared client-side in `attempt.ts:126`), which is a separate security concern beyond the scope of this fix. Left for the user to decide the intended design before changing backend auth boundaries.
