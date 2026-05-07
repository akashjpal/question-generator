-- Run these once in the Supabase SQL Editor (or as a migration).
-- They eliminate full table scans on every Reports API request.

-- Speeds up all WHERE/JOIN on assessmentId (used in every query)
CREATE INDEX IF NOT EXISTS idx_assessment_result_assessment_id
    ON "AssessmentResult" ("assessmentId");

-- Covering index for dashboard aggregates grouped/filtered by assessmentId.
-- INCLUDE lets Postgres satisfy score/totalScore reads from the index when possible.
CREATE INDEX IF NOT EXISTS idx_assessment_result_assessment_id_score_total
    ON "AssessmentResult" ("assessmentId")
    INCLUDE ("score", "totalScore");

-- Speeds up ORDER BY created_at DESC used in GetRecentAssessments
CREATE INDEX IF NOT EXISTS idx_assessment_table_created_at
    ON "assessment_table" (created_at DESC, id);
