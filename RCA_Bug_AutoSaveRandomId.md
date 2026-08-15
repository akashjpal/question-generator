# RCA: Auto-Save Always Tries to UPDATE a Non-Existent Row — Nothing Persisted to DB

## Symptom
- Auto-save fires every 5 seconds, API receives the request, no error is thrown
- No assessment row is created in the database
- Frontend shows no data for the new assessment

---

## Root Cause (Step-by-Step Trace)

### 1. Random ID Initialized at Component Creation
```typescript
// create-assessment.ts
public assessmentData: Assessment = {
    id: crypto.getRandomValues(new Uint32Array(1))[0],  // e.g., 2512950616
    status: AssessmentStatus.draft,
    ...
};
```
A random 32-bit integer is assigned as `id` before any API call is made. This value does **not** exist in the database.

---

### 2. Auto-Save Sends This Random ID
```typescript
// autoSave()
const snapshot: any = {
    ...this.assessmentData,
    id: this.editId ?? this.assessmentData.id,  // null ?? 2512950616 = 2512950616
    ...
};
```
`editId` is `null` for a new assessment, so the nullish coalescing falls through to `assessmentData.id = 2512950616`.

---

### 3. API's publishAssessment Takes the UPDATE Path
```typescript
// publisher.ts — publishAssessment()
const id = (assessment as any).id;  // 2512950616
if (id !== undefined && id !== null) {
    // ← THIS BRANCH IS TAKEN (2512950616 is neither undefined nor null)
    supabase.from("assessment_table").update(assessment).eq("id", 2512950616);
```
Because the ID is truthy (not `null`, not `undefined`), Supabase runs an **UPDATE** — not an INSERT.

---

### 4. UPDATE Matches Zero Rows — Silently
Supabase finds no row with `id = 2512950616`. The UPDATE succeeds with zero rows affected and returns an **empty array**: `data = []`.  
No error is thrown. The API returns `{ message: "assessment updated successfully", data: [] }`.

---

### 5. Frontend Never Captures a Real ID
```typescript
// autoSave() callback
if (!this.editId && res.data?.[0]?.id) {  // res.data is [] → false
    this.editId = res.data[0].id;          // ← never runs
}
```
`res.data` is empty, so `this.editId` stays `null`. The random ID `2512950616` is used again on the next tick.

---

### 6. Infinite Loop of Silent No-Ops
Every 5 seconds:
- Same random ID sent → UPDATE where id = 2512950616 → 0 rows → empty response → `editId` never set
- Assessment is never INSERT-ed into the database

---

## Why It Appeared to "Work"
The API logs `"Publishing assessment: { id: 2512950616, ... }"` and returns HTTP 200. No exception is raised. The UPDATE simply does nothing.

---

## Fix

The snapshot's `id` must be `null` / `undefined` for a new assessment so `publishAssessment` takes the INSERT path.

```typescript
// autoSave() — correct snapshot
const snapshot: any = {
    ...this.assessmentData,
    id: this.editId || undefined,   // null → undefined → API INSERTs; real id → API UPDATEs
    questions: this.questions,
    status: this.assessmentData.status ?? AssessmentStatus.draft
};
```

And `assessmentData.id` should NOT be pre-populated with a random number for new assessments:

```typescript
public assessmentData: Assessment = {
    id: '',   // or omit / null — must be falsy so API inserts on first save
    ...
};
```

---

## Timeline of Decisions That Led Here
| Step | Decision | Effect |
|------|----------|--------|
| Initial code | `id: ''` (empty string) | INSERT would still fail (`'' !== null && '' !== undefined`) |
| User change | `id: crypto.getRandomValues(...)` | Made it worse — now always a truthy non-DB value |
| Auto-save logic | `this.editId ?? this.assessmentData.id` | Falls through to the random number when `editId = null` |
| `publishAssessment` guard | `id !== null && id !== undefined` | Any truthy value → UPDATE; only null/undefined → INSERT |

---

## Correct Insert/Update Contract
| Scenario | `id` sent to API | `publishAssessment` action |
|----------|-----------------|---------------------------|
| New assessment | `undefined` | INSERT → returns new row with real DB id |
| After first save | real DB id (e.g., 47) | UPDATE → updates the correct row |
| Edit mode | route param id | UPDATE → updates the correct row |
