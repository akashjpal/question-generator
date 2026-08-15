# RCA: Reports API Slow Load

**Date:** 2026-05-03  
**Severity:** High — every page load is affected  
**Affected Endpoint:** `GET /reports-api/api/dashboard/stats` and `GET /reports-api/api/dashboard/stats/{id}`

---

## Root Cause Summary

The Reports API is slow due to **three compounding issues**:

1. **Sequential database calls** — independent queries are awaited one after another instead of running in parallel.
2. **Inefficient SQL aggregation** — `GetRecentAssessments` aggregates the entire `AssessmentResult` table before applying `LIMIT 5`, doing far more work than needed.
3. **Missing database index** — `AssessmentResult.assessmentId` has no index, causing full table scans on every JOIN and WHERE clause.

---

## Deep Dive

### Issue 1 — Sequential DB Calls (Highest Impact)

**File:** `ReportsAPI/Services/DashBoardStatsService.cs`

```csharp
// GetDashBoardStats: two independent queries run one after the other
DashBoardStatsResponse response = await _dashboardStatsRepository.GetDashboardStats();
response.RecentActivity = await _dashboardStatsRepository.GetRecentAssessments();

// GetAssessmentStats: same problem
AssessmentResponse response = await _dashboardStatsRepository.GetAssessmentStats(id);
response.studentResults = await _dashboardStatsRepository.GetAssessmentStatsOfStudent(id);
```

Each pair of queries is **completely independent** — neither result depends on the other. Yet they are awaited sequentially. If each query takes 300 ms, the endpoint takes 600 ms minimum. With `Task.WhenAll()` it would take ~300 ms.

**Fix:** Use `Task.WhenAll()` to run both queries simultaneously.

---

### Issue 2 — Inefficient SQL in GetRecentAssessments (High Impact)

**File:** `ReportsAPI/Repository/DashboardStatsRepository.cs` — `GetRecentAssessments()`

```sql
SELECT a."id", a."title", a."subject",
       COUNT(*) AS "Participants",
       ROUND((SUM(ar."score")::numeric / NULLIF(SUM(ar."totalScore"), 0)) * 100, 2) AS "AvgScore",
       a."created_at" as "createdAt"
FROM "AssessmentResult" ar
INNER JOIN "assessment_table" a ON a."id" = ar."assessmentId"
GROUP BY a."id"
ORDER BY a."created_at" DESC
LIMIT 5
```

This query groups and aggregates **every row in AssessmentResult** for every assessment that has ever existed — then throws away all but 5. The fix is to first find the 5 most recent assessments, then aggregate only those rows.

**Fix:** Use a CTE or subquery to limit assessments before joining:

```sql
WITH recent AS (
    SELECT id, title, subject, created_at
    FROM "assessment_table"
    ORDER BY created_at DESC
    LIMIT 5
)
SELECT r.id, r.title, r.subject,
       COUNT(*) AS "Participants",
       ROUND((SUM(ar."score")::numeric / NULLIF(SUM(ar."totalScore"), 0)) * 100, 2) AS "AvgScore",
       r.created_at AS "createdAt"
FROM recent r
INNER JOIN "AssessmentResult" ar ON ar."assessmentId" = r.id
GROUP BY r.id, r.title, r.subject, r.created_at
ORDER BY r.created_at DESC
```

---

### Issue 3 — Missing DB Index on assessmentId (High Impact)

`AssessmentResult.assessmentId` is used in every WHERE clause and JOIN. Without an index, PostgreSQL does a sequential scan of the full table on every request.

```sql
-- Required index (run once in Supabase SQL editor)
CREATE INDEX IF NOT EXISTS idx_assessment_result_assessment_id
    ON "AssessmentResult" ("assessmentId");

CREATE INDEX IF NOT EXISTS idx_assessment_table_created_at
    ON "assessment_table" (created_at DESC);
```

---

### Issue 4 — Client-Side Processing Loop (Minor)

**File:** `ReportsAPI/Services/DashBoardStatsService.cs`

```csharp
for (int i = 0; i < response.studentResults.Length; i++)
{
    response.studentResults[i].time = TimeSpan.FromSeconds(...).ToString(@"mm\:ss");
    if (response.studentResults[i].score >= 75)
        response.studentResults[i].status = "Passed";
    else
        response.studentResults[i].status = "Failed";
}
```

The Pass/Fail status can be computed directly in SQL using a `CASE` expression, eliminating the loop entirely and reducing memory allocation.

---

### Issue 5 — Debug Console.WriteLine in Production (Minor)

**File:** `ReportsAPI/Controllers/ReportsStatController.cs:37`

```csharp
Console.WriteLine($"Received request for dashboard stats of assessment with ID: {id}");
```

Every request synchronously writes to stdout. Minor CPU/IO overhead in production.

---

### Issue 6 — Wrong WHERE Column in `GetAssessmentStats` (Index Never Used)

**File:** `ReportsAPI/Repository/DashboardStatsRepository.cs` — `GetAssessmentStats()`

```sql
-- BEFORE: filters on the joined table's PK
WHERE at.id = @Id
```

The index `idx_assessment_result_assessment_id` on `AssessmentResult."assessmentId"` is never hit because the filter is on `assessment_table.id`, not on the indexed column. PostgreSQL joins first, then filters, doing a full scan of `AssessmentResult`.

**Fix:**
```sql
-- AFTER: filters on the indexed FK column
WHERE ar."assessmentId" = @Id
```

---

### Issue 7 — Wrong `date` Column Alias (Always Null in Response)

**File:** `ReportsAPI/Repository/DashboardStatsRepository.cs` — `GetAssessmentStats()`

```sql
at.created_at as "createdAt"   -- DTO property is `date` → Dapper never maps it → always null
```

`AssessmentResponse.date` was always `null` in every API response because Dapper maps by exact column name.

**Fix:**
```sql
TO_CHAR(at.created_at, 'Mon DD, YYYY') AS "date"
```

---

### Issue 8 — Division by Zero in `GetDashboardStats`

**File:** `ReportsAPI/Repository/DashboardStatsRepository.cs` — `GetDashboardStats()`

```sql
ROUND((SUM("score")::numeric / SUM("totalScore")) * 100, 2) AS "averagePerformance"
```

If no rows exist (empty `AssessmentResult`), `SUM("totalScore") = 0` → division by zero, throwing a runtime exception.

**Fix:**
```sql
ROUND((SUM("score")::numeric / NULLIF(SUM("totalScore"), 0)) * 100, 2) AS "averagePerformance"
```

---

## Fix Checklist

- [ ] Parallelize DB calls with `Task.WhenAll()` in `DashBoardStatsService.cs`
- [ ] Merge `GetAssessmentStats` + `GetAssessmentStatsOfStudent` into one window-function query
- [ ] Rewrite `GetRecentAssessments` SQL to use CTE scoping to 5 recent assessments
- [ ] Fix wrong WHERE column in `GetAssessmentStats` (`at.id` → `ar."assessmentId"`)
- [ ] Fix wrong date alias (`"createdAt"` → `"date"`)
- [ ] Add `NULLIF` to prevent division by zero in `GetDashboardStats`
- [ ] Add `IMemoryCache` (60 s TTL) to `DashBoardStatsService.cs`
- [ ] Move time formatting and Pass/Fail `CASE` into SQL
- [ ] Run index migrations in Supabase SQL editor
- [ ] Remove `Console.WriteLine` from controller
