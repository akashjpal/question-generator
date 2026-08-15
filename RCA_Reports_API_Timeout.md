# RCA: Reports API Timeout

## Symptom
Reports API requests timeout despite having database indexes applied.

## Root Causes (ordered by impact)

### 1. `Pooling=false` in Connection String (CRITICAL)
```
# docker-compose.yml line 92
ConnectionStrings__DefaultConnection=${DATABASE_CONNECTION_STRING};...;Pooling=false
```
Every single query opens a **brand new TCP connection** to remote Supabase:
```
DNS resolve → TCP handshake → TLS handshake → Postgres auth → Query → Teardown
```
This adds **500ms–2s overhead PER QUERY** to a remote Supabase host. The `GetDashBoardStats()` 
service runs 2 queries in parallel → 2 fresh connections → 1–4s wasted on connection setup alone.

### 2. Full Table Scan on Dashboard Stats (HIGH)
```sql
SELECT COUNT(DISTINCT "assessmentId"), COUNT(*), SUM("score")...
FROM "AssessmentResult"
```
This scans the **entire** `AssessmentResult` table. **No index can help** — it's an unfiltered 
aggregate over all rows. As data grows, this query gets linearly slower.

### 3. No Caching on Dashboard Stats (HIGH)  
`GetAssessmentStats(id)` has a 60s memory cache, but `GetDashBoardStats()` (the heavier 
full-table-scan query) has **zero caching** — every page load re-scans the entire table.

### 4. `make_interval()` Per-Row Computation (LOW)
```sql
COALESCE(TO_CHAR(make_interval(secs => ar."timeTaken"::numeric), 'MI:SS'), '00:00')
```
`make_interval()` is a relatively expensive function called per row. Can be replaced with 
simple integer arithmetic.

## Timeline of a Failing Request
```
t=0ms      HTTP request arrives
t=0ms      GetDashboardStats() + GetRecentAssessments() fire in parallel
t=0ms      Connection 1: DNS + TCP + TLS + Auth to Supabase... (Pooling=false)
t=0ms      Connection 2: DNS + TCP + TLS + Auth to Supabase... (Pooling=false)
t=1500ms   Connection 1 ready → full table scan begins
t=1800ms   Connection 2 ready → CTE query begins
t=???ms    Full scan still running on large table...
t=60000ms  TIMEOUT ❌
```

## Fix Summary

| Fix | What | Impact |
|-----|-------|--------|
| Enable connection pooling | Remove `Pooling=false`, add pool settings | ~1.5s saved per request |
| Cache dashboard stats | 30s MemoryCache on the full-scan query | Eliminates repeat scans |
| Cache recent assessments | 30s MemoryCache | Eliminates repeat CTE+JOIN |
| Replace `make_interval` | Use integer math `(timeTaken/60)` || `(timeTaken%60)` | Minor per-row saving |
| Add Dapper command timeout | `commandTimeout: 15` | Fail fast, don't hang 60s |
