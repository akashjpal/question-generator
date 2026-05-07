namespace ReportsAPI.Repository;

using Dapper;
using Npgsql;
using ReportsAPI.DTOs.response;

public class DashboardStatsRepository : IDashboardStatsRepository
{
    private readonly NpgsqlDataSource _dataSource;

    public DashboardStatsRepository(NpgsqlDataSource dataSource)
    {
        _dataSource = dataSource;
    }

    // Flat row returned by the window-function query in GetAssessmentStats.
    private class FlatAssessmentRow
    {
        public long Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Subject { get; set; } = string.Empty;
        public string Date { get; set; } = string.Empty;
        public double AvgScore { get; set; }
        public double HighestScore { get; set; }
        public double LowestScore { get; set; }
        public int Participants { get; set; }
        public string Student { get; set; } = string.Empty;
        public double Score { get; set; }
        public string Time { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
    }

    // Runs BOTH dashboard queries on a SINGLE connection (one TLS handshake, one auth)
    // instead of opening two parallel connections that double the cold-start penalty.
    public async Task<(DashBoardStatsResponse stats, RecentAssessmentReport[] recent)> GetDashboardDataAsync()
    {
        using var connection = await _dataSource.OpenConnectionAsync();

        // ── Query 1: aggregate stats ──────────────────────────────
        var statsSql = @"SELECT
            COUNT(DISTINCT ""assessmentId"") AS ""totalAssessments"",
            COUNT(*)                        AS ""totalParticipants"",
            ROUND((SUM(""score"")::numeric / NULLIF(SUM(""totalScore""), 0)) * 100, 2) AS ""averagePerformance""
            FROM ""AssessmentResult""";

        var stats = await connection.QuerySingleOrDefaultAsync<DashBoardStatsResponse>(statsSql)
                    ?? new DashBoardStatsResponse();

        // ── Query 2: recent 5 assessments (reuses the SAME open connection) ──
        var recentSql = @"
            WITH recent AS (
                SELECT id, title, subject, created_at
                FROM ""assessment_table""
                ORDER BY created_at DESC
                LIMIT 5
            )
            SELECT
                r.id                                                                            AS ""id"",
                r.title                                                                         AS ""title"",
                r.subject                                                                       AS ""subject"",
                COUNT(ar.*)                                                                     AS ""Participants"",
                ROUND((SUM(ar.""score"")::numeric / NULLIF(SUM(ar.""totalScore""), 0)) * 100, 2) AS ""AvgScore"",
                r.created_at                                                                    AS ""createdAt""
            FROM recent r
            LEFT JOIN ""AssessmentResult"" ar ON ar.""assessmentId"" = r.id
            GROUP BY r.id, r.title, r.subject, r.created_at
            ORDER BY r.created_at DESC";

        var recent = (await connection.QueryAsync<RecentAssessmentReport>(recentSql)).ToArray();

        return (stats, recent);
    }

    public async Task<AssessmentResponse> GetAssessmentStats(long id)
    {
        using var connection = await _dataSource.OpenConnectionAsync();

        var sql = @"
            SELECT
                at.id                                                                               AS ""id"",
                at.title                                                                            AS ""title"",
                at.subject                                                                          AS ""subject"",
                TO_CHAR(at.created_at, 'Mon DD, YYYY')                                             AS ""date"",
                ROUND(AVG(ar.""score""::numeric / NULLIF(ar.""totalScore"", 0) * 100) OVER (), 2)  AS ""avgScore"",
                MAX(ROUND(ar.""score""::numeric / NULLIF(ar.""totalScore"", 0) * 100, 2)) OVER ()  AS ""highestScore"",
                MIN(ROUND(ar.""score""::numeric / NULLIF(ar.""totalScore"", 0) * 100, 2)) OVER ()  AS ""lowestScore"",
                COUNT(*) OVER ()                                                                    AS ""participants"",
                ar.""participantUniqueCode""                                                        AS ""student"",
                ROUND(ar.""score""::numeric / NULLIF(ar.""totalScore"", 0) * 100, 2)               AS ""score"",
                LPAD(FLOOR(ar.""timeTaken""::numeric / 60)::int::text, 2, '0')
                    || ':' ||
                    LPAD((ar.""timeTaken""::numeric::int % 60)::text, 2, '0')                      AS ""time"",
                CASE WHEN ROUND(ar.""score""::numeric / NULLIF(ar.""totalScore"", 0) * 100, 2) >= 75
                     THEN 'Passed' ELSE 'Failed' END                                               AS ""status""
            FROM ""AssessmentResult"" AS ar
            INNER JOIN ""assessment_table"" AS at ON at.id = ar.""assessmentId""
            WHERE ar.""assessmentId"" = @Id";

        var rows = (await connection.QueryAsync<FlatAssessmentRow>(sql, new { Id = id })).ToArray();

        if (rows.Length == 0)
            throw new KeyNotFoundException($"No results found for assessment {id}.");

        var first = rows[0];
        return new AssessmentResponse
        {
            id = first.Id,
            title = first.Title,
            subject = first.Subject,
            date = first.Date,
            avgScore = first.AvgScore,
            highestScore = first.HighestScore,
            lowestScore = first.LowestScore,
            participants = first.Participants,
            studentResults = rows.Select(r => new StudentResult
            {
                student = r.Student,
                score = r.Score,
                time = r.Time,
                status = r.Status
            }).ToArray()
        };
    }
}
