# RCA: Manual Question Options Not Visible

**Date:** 2026-05-02  
**Component:** `ai-metimeter-client/src/app/pages/dashboard/create-assessment/`

---

## Summary

When a teacher clicks "Add Manual Question", the question card appears but the options grid is completely empty — no input fields are shown. This makes it impossible to enter answer choices for manually created questions.

---

## Root Cause Analysis

### Bug 1 (Primary) — `filteredOptions` initialized as empty array

**File:** [create-assessment.ts:285-294](ai-metimeter-client/src/app/pages/dashboard/create-assessment/create-assessment.ts#L285-L294)

```typescript
// BEFORE (broken)
addQuestion() {
    this.questions.push({
        question_text: 'New Question',
        options: '',
        correctAnswer: 0,
        correct_options: '',
        filteredOptions: [],   // ← empty array → zero rows rendered
        explanation: ''
    });
}
```

**Template (line 139):**
```html
<div class="option-row" *ngFor="let opt of q.filteredOptions; ...">
```

The `*ngFor` renders one row per element in `filteredOptions`. With an empty array `[]`, no rows are rendered → no option inputs appear. The user cannot see or enter any options.

**AI-generated flow works** because `filterGeneratedQuestions()` always populates `filteredOptions` with 4 parsed option strings from the Groq API response. Manual flow was never given the same initialization.

---

### Bug 2 (Secondary) — Step 3 preview iterates `q.options` instead of `q.filteredOptions`

**File:** [create-assessment.html:191](ai-metimeter-client/src/app/pages/dashboard/create-assessment/create-assessment.html#L191)

```html
<!-- BEFORE (broken) -->
<span *ngFor="let opt of q.options; ...">
```

`q.options` is the **raw** field — for AI questions it's a JSON string (e.g. `'["A. Foo", "B. Bar"]'`), for manual questions it's `''`. Iterating over a string gives individual characters; iterating over an empty string gives nothing. Preview shows garbage or nothing.

The correct field is `q.filteredOptions` (the cleaned, array form always used in Step 2 editing).

---

### Bug 3 (Secondary) — `filteredOptions` edits not synced to `options` before publish

When the teacher edits option text in Step 2, changes go into `filteredOptions[i]`. The raw `options` field is never updated. On publish the payload carries the stale `options` value. The backend receives out-of-date option data unless it exclusively reads `filteredOptions`.

`filteredOptions` must be serialized back to `options` (JSON string) before the assessment is sent to the API.

---

## Impact

| Scenario | Impact |
|---|---|
| Add Manual Question | Zero option inputs shown — feature completely broken |
| Preview AI-generated | Options render as individual characters (garbled) |
| Publish edited AI questions | Option edits may be silently discarded if backend reads `options` |
| Publish manual questions | `options` sent as `''` — no answer choices stored |

---

## Fix Plan

| # | Location | Change |
|---|---|---|
| 1 | `addQuestion()` | Initialize `filteredOptions: ['', '', '', '']` (4 slots matching MCQ format) |
| 2 | Step 3 template line 191 | Change `*ngFor="let opt of q.options"` → `*ngFor="let opt of q.filteredOptions"` |
| 3 | `publishAssessment()` + `updateAssessment()` | Sync each question's `filteredOptions` → `options` (JSON) before sending |

This centralizes `filteredOptions` as the single source of truth for display and editing across both AI-generated and manual questions.
