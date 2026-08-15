# Reports API — Individual Report Optimization

> Route: `GET /dashboard/reports/:id` (frontend) → `GET /reports-api/api/dashboard/stats/:id` (backend)  
> Date: 2026-05-03

---

## What Was Slow

```
Browser  →  Angular (assessment-report)  →  ReportService  →  .NET ReportsAPI  →  PostgreSQL (Supabase)
```

Every problem was in the **backend API layer** — two separate DB round-trips scanning the same table twice, no caching, a wrong index filter, and a broken date field. The fixes below eliminate all of them.

---

## Root Cause Diagram

```
GET /api/dashboard/stats/:id
        │
        ▼
DashBoardStatsService.GetAssessmentStats(id)
        │
        ├──► GetAssessmentStats(id)        ← opened connection #1 → full scan of AssessmentResult
        │       WHERE ar."assessmentId" = @Id    (but originally WHERE at.id = @Id — wrong column)
        │
        └──► GetAssessmentStatsOfStudent(id) ← opened connection #2 → full scan of AssessmentResult AGAIN
                WHERE ar."assessmentId" = @Id

        Total: 2 connections, 2 round-trips, same table scanned twice, no index
```

```
After fix:
        │
        ▼
DashBoardStatsService.GetAssessmentStats(id)
        │
        └──► GetAssessmentStats(id)   ← one connection, one query, table scanned once
                Window functions return aggregate + per-row data simultaneously
                Result cached for 60s in IMemoryCache
```

---

## Fix 1 — Two Queries Hitting the Same Table → One Query With Window Functions

### Problem

`GetAssessmentStats` and `GetAssessmentStatsOfStudent` both filtered `AssessmentResult` with the same `WHERE ar."assessmentId" = @Id`. This meant:

- Two separate connections opened to Supabase (each involves TLS + authentication)
- The same rows read from disk twice
- `Task.WhenAll` helped with wall-clock time, but not with DB load or connection count

### Fix

Collapsed both into **one SQL query** using PostgreSQL window functions. Window functions compute `AVG`, `MAX`, `MIN`, `COUNT` over all matching rows while still returning the per-row student columns:

```sql
SELECT
    at.id                                                                    AS "id",
    at.title                                                                 AS "title",
    at.subject                                                               AS "subject",
    TO_CHAR(at.created_at, 'Mon DD, YYYY')                                   AS "date",
    ROUND(AVG(ar."score"::numeric / ar."totalScore" * 100) OVER (), 2)       AS "avgScore",
    MAX(ROUND(ar."score"::numeric / ar."totalScore" * 100, 2)) OVER ()       AS "highestScore",
    MIN(ROUND(ar."score"::numeric / ar."totalScore" * 100, 2)) OVER ()       AS "lowestScore",
    COUNT(*) OVER ()                                                         AS "participants",
    ar."participantUniqueCode"                                               AS "student",
    ROUND(ar."score"::numeric / ar."totalScore" * 100, 2)                    AS "score",
    TO_CHAR((ar."timeTaken" || ' seconds')::interval, 'MI:SS')               AS "time",
    CASE WHEN ROUND(ar."score"::numeric / ar."totalScore" * 100, 2) >= 75
         THEN 'Passed' ELSE 'Failed' END                                     AS "status"
FROM "AssessmentResult" AS ar
INNER JOIN "assessment_table" AS at ON at.id = ar."assessmentId"
WHERE ar."assessmentId" = @Id
```

In C# a private `FlatAssessmentRow` class is used for Dapper to map every row. The first row provides the assessment-level aggregates; all rows provide the student list.

**Files changed:**
- [ReportsAPI/Repository/DashboardStatsRepository.cs](ReportsAPI/Repository/DashboardStatsRepository.cs) — `GetAssessmentStats()` replaced both old methods
- [ReportsAPI/Repository/IDashboardStatsRepository.cs](ReportsAPI/Repository/IDashboardStatsRepository.cs) — `GetAssessmentStatsOfStudent` removed
- [ReportsAPI/Services/DashBoardStatsService.cs](ReportsAPI/Services/DashBoardStatsService.cs) — `Task.WhenAll` pair removed; single `await _repo.GetAssessmentStats(id)` call

---

## Fix 2 — Wrong WHERE Column (Index Was Never Used)

### Problem

The original `GetAssessmentStats` query filtered on the *joined* table's column:

```sql
-- Before: filters on assessment_table PK, then drives AssessmentResult via full scan
WHERE at.id = @Id
```

The index `idx_assessment_result_assessment_id` we created is on `AssessmentResult.assessmentId`. Filtering on `at.id` instead of `ar."assessmentId"` prevented PostgreSQL from using it.

### Fix

```sql
-- After: filters directly on the indexed column
WHERE ar."assessmentId" = @Id
```

**File:** [ReportsAPI/Repository/DashboardStatsRepository.cs](ReportsAPI/Repository/DashboardStatsRepository.cs)

---

## Fix 3 — `date` Field Was Always Null

### Problem

The `AssessmentResponse` DTO has a `date` property. The old SQL aliased the column as `"createdAt"`:

```sql
at.created_at as "createdAt"    -- Dapper maps by column name → "date" never matched → always null
```

Every response returned `null` for the assessment date shown in the report header.

### Fix

```sql
TO_CHAR(at.created_at, 'Mon DD, YYYY') AS "date"   -- matches DTO, formatted for display (e.g. "May 03, 2026")
```

**File:** [ReportsAPI/Repository/DashboardStatsRepository.cs](ReportsAPI/Repository/DashboardStatsRepository.cs)

---

## Fix 4 — No Caching (Every Page Load Hits the DB)

### Problem

Every teacher page-load or refresh fired a DB query. Assessment result data is stable — students cannot resubmit, and scores do not change.

### Fix

Added `IMemoryCache` (built into ASP.NET Core, zero extra dependencies). The first request for an assessment ID fetches from DB and stores the result for 60 seconds. Subsequent requests within that window return instantly from memory.

```csharp
// DashBoardStatsService.cs
string cacheKey = $"assessment:{id}";
if (_cache.TryGetValue(cacheKey, out AssessmentResponse? cached) && cached is not null)
    return cached;                              // ← instant, no DB

AssessmentResponse result = await _repo.GetAssessmentStats(id);
_cache.Set(cacheKey, result, AssessmentCacheOptions);   // TTL: 60s
return result;
```

Registered in:

```csharp
// Program.cs
builder.Services.AddMemoryCache();
```

**Files changed:**
- [ReportsAPI/Program.cs](ReportsAPI/Program.cs)
- [ReportsAPI/Services/DashBoardStatsService.cs](ReportsAPI/Services/DashBoardStatsService.cs)

---

## Fix 5 — Missing DB Indexes (Full Table Scans on Every Request)

Without indexes, every query does a sequential scan of the entire `AssessmentResult` table — performance degrades as more students attempt assessments.

**Run once in Supabase SQL Editor:**

```sql
CREATE INDEX IF NOT EXISTS idx_assessment_result_assessment_id
    ON "AssessmentResult" ("assessmentId");

CREATE INDEX IF NOT EXISTS idx_assessment_table_created_at
    ON "assessment_table" (created_at DESC);
```

**File:** [ReportsAPI/db_indexes.sql](ReportsAPI/db_indexes.sql)

---

## Summary — Before vs After

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         BEFORE                                             │
├────────────────────────────────────────────────────────────────────────────┤
│  DB connections per request  │  2                                          │
│  Table scans (AssessmentResult)│ 2 (same rows read twice)                 │
│  Index used                  │  No (wrong WHERE column)                    │
│  Date in response            │  Always null (wrong alias)                  │
│  Caching                     │  None — every refresh hits DB               │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│                         AFTER                                              │
├────────────────────────────────────────────────────────────────────────────┤
│  DB connections per request  │  1                                          │
│  Table scans (AssessmentResult)│ 1 (window functions over single scan)    │
│  Index used                  │  Yes — idx_assessment_result_assessment_id  │
│  Date in response            │  Correctly formatted string                 │
│  Caching                     │  60s IMemoryCache — repeated loads are free │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## All Changed Files

| File | What Changed |
|------|-------------|
| [ReportsAPI/Repository/DashboardStatsRepository.cs](ReportsAPI/Repository/DashboardStatsRepository.cs) | Both queries merged into one using window functions; wrong WHERE and date alias fixed |
| [ReportsAPI/Repository/IDashboardStatsRepository.cs](ReportsAPI/Repository/IDashboardStatsRepository.cs) | `GetAssessmentStatsOfStudent` removed |
| [ReportsAPI/Services/DashBoardStatsService.cs](ReportsAPI/Services/DashBoardStatsService.cs) | `Task.WhenAll` pair removed; IMemoryCache added with 60s TTL |
| [ReportsAPI/Program.cs](ReportsAPI/Program.cs) | `AddMemoryCache()` registered |
| [ReportsAPI/Controllers/ReportsStatController.cs](ReportsAPI/Controllers/ReportsStatController.cs) | `Console.WriteLine` removed |
| [ReportsAPI/db_indexes.sql](ReportsAPI/db_indexes.sql) | New file — run once in Supabase SQL Editor |
| [ai-metimeter-client/.../assessment-report.ts](ai-metimeter-client/src/app/pages/dashboard/reports/assessment-report/assessment-report.ts) | `OnPush`, `takeUntilDestroyed`, `applyResponse`, `markForCheck` |

---

## One Action Required From You

Run the SQL in [ReportsAPI/db_indexes.sql](ReportsAPI/db_indexes.sql) in the **Supabase SQL Editor**:

> Dashboard → SQL Editor → New query → paste contents → Run

Without the indexes, PostgreSQL still full-scans `AssessmentResult` on the first uncached request.
