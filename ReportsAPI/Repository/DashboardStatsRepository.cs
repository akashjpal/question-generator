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

    public async Task<DashBoardStatsResponse> GetDashboardStats()
    {
        try
        {
            using var connection = await _dataSource.OpenConnectionAsync();

            var sql = @"SELECT 
            COUNT(DISTINCT ""assessmentId"") AS ""totalAssessments"",
            COUNT(*) AS ""totalParticipants"",
            ROUND((SUM(""score"")::numeric / SUM(""totalScore"")) * 100, 2) AS ""averagePerformance""
            FROM ""AssessmentResult""";

            DashBoardStatsResponse? result = await connection.QuerySingleOrDefaultAsync<DashBoardStatsResponse>(sql);

            if (result == null)
            {
                throw new Exception("Failed to retrieve dashboard stats from the database.");
            }

            return result;
        }
        catch (Exception ex)
        {
            // Log the exception
            throw new Exception("An error occurred while fetching dashboard stats from the database.", ex);
        }
    }
    public async Task<RecentAssessmentReport[]> GetRecentAssessments()
    {
        try
        {
            using var connection = await _dataSource.OpenConnectionAsync();

            //    use above sql query
            var sql = @"SELECT 
                            a.""id"" as ""id"",
                            a.""title"",
                            a.""subject"",
                            COUNT(*) AS ""Participants"",
                            ROUND((SUM(ar.""score"")::numeric / NULLIF(SUM(ar.""totalScore""), 0)) * 100, 2) AS ""AvgScore"",
                            a.""created_at"" as ""createdAt""
                        FROM ""AssessmentResult"" ar
                        INNER JOIN ""assessment_table"" a ON a.""id"" = ar.""assessmentId""
                        GROUP BY a.""id""
                        ORDER BY a.""created_at"" DESC
                        LIMIT 5
                        ";
            RecentAssessmentReport[] recentAssessments = (await connection.QueryAsync<RecentAssessmentReport>(sql)).ToArray();
            return recentAssessments;
        }
        catch (Exception ex)
        {
            // Log the exception
            throw new Exception("An error occurred while fetching recent assessments from the database.", ex);
        }
    }

    public async Task<AssessmentResponse> GetAssessmentStats(int id)
    {
        try
        {
            using var connection = await _dataSource.OpenConnectionAsync();

            var sql = @"
            SELECT
                at.id as ""id"",
                at.title as ""title"",
                at.subject as ""subject"",
                at.created_at as ""createdAt"",
                ROUND(AVG(ar.""score""::numeric / ar.""totalScore"" * 100), 2) AS ""avgScore"",
                MAX(ROUND(ar.""score""::numeric / ar.""totalScore"" * 100, 2)) AS ""highestScore"",
                MIN(ROUND(ar.""score""::numeric / ar.""totalScore"" * 100, 2)) AS ""lowestScore""
            FROM ""AssessmentResult"" AS ar
            INNER JOIN ""assessment_table"" AS at ON ar.""assessmentId"" = at.id
            WHERE at.id = @Id
            GROUP BY at.id;
            ";

            AssessmentResponse? result = await connection.QuerySingleOrDefaultAsync<AssessmentResponse>(sql, new { Id = id });

            if (result == null)
            {
                throw new Exception("Failed to retrieve assessment stats from the database.");
            }

            return result;
        }
        catch (Exception ex)
        {
            // Log the exception
            throw new Exception("An error occurred while fetching assessment stats from the database.", ex);
        }
    }
    public async Task<StudentResult[]> GetAssessmentStatsOfStudent(int id)
    {
        try
        {
            using var connection = await _dataSource.OpenConnectionAsync();
            var sql = @"
            SELECT 
                ar.""participantUniqueCode"" AS ""student"",
                ROUND(ar.""score""::numeric / ar.""totalScore"" * 100, 2) AS ""score"",
                ar.""timeTaken"" AS ""time""
            FROM ""AssessmentResult"" AS ar
            WHERE ar.""assessmentId"" = @Id
            ";

            StudentResult[] studentResults = (await connection.QueryAsync<StudentResult>(sql, new { Id = id })).ToArray();
            return studentResults;
        }
        catch (Exception ex)
        {
            // Log the exception
            throw new Exception("An error occurred while fetching assessment stats of students from the database.", ex);
        }
    }
}