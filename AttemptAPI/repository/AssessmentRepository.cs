using AttemptAPI.dtos.request;
using AttemptAPI.dtos.request;
using AttemptAPI.Models;
using AttemptAPI.services;
using AttemptAPI.Models;
using AttemptAPI.dtos.request;
using Dapper;
using Npgsql;
namespace AttemptAPI.repository;
public class AssessmentRepository: IAssessmentRepository
{
    private readonly NpgsqlDataSource _dataSource;
    public AssessmentRepository(NpgsqlDataSource dataSource)
    {
        _dataSource = dataSource;
    }

    public async Task<AssessmentResult> saveAttemptToDb(AssessmentResult request)
    {
        try
        {
            using var connection = await _dataSource.OpenConnectionAsync();
            var sql = @"INSERT INTO ""AssessmentResult"" (""assessmentId"", ""participantUniqueCode"", ""answersJson"", ""flaggedQuestionsJson"", ""score"", ""timeTaken"", ""timeLimit"", ""attemptStatus"")
                        VALUES (@AssessmentId, @ParticipantUniqueCode, @AnswersJson, @FlaggedQuestionsJson, @Score, @TimeTaken, @TimeLimit, @AttemptStatus)
                        ON CONFLICT (""participantUniqueCode"") DO UPDATE SET
                            ""participantUniqueCode"" = EXCLUDED.""participantUniqueCode"",
                            ""answersJson""           = EXCLUDED.""answersJson"",
                            ""flaggedQuestionsJson""  = EXCLUDED.""flaggedQuestionsJson"",
                            ""score""                 = EXCLUDED.""score"",
                            ""timeTaken""             = EXCLUDED.""timeTaken"",
                            ""timeLimit""             = EXCLUDED.""timeLimit"",
                            ""attemptStatus""         = EXCLUDED.""attemptStatus"",
                            ""totalScore""            = EXCLUDED.""totalScore""
                            ";
            await connection.ExecuteAsync(sql, request);
            return request;
        }catch(Exception ex)
        {
            Console.WriteLine($"Error saving attempt to database: {ex.Message}");
            throw new Exception("Failed to save attempt to database", ex);
        }
    }
}

    
