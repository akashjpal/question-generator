using AttemptAPI.dtos.request;
using AttemptAPI.Models;
using AttemptAPI.repository;
using System.Text.Json;
namespace AttemptAPI.services;

public class SubmitAssessmentService : ISubmitAssessmentService
{
    private readonly IAssessmentRepository _repository;
    public SubmitAssessmentService(IAssessmentRepository repository) {
        _repository = repository;
    }
    public async Task<AssessmentResult> SaveAssessment(AssessmentResultRequest request)
    {
        AssessmentResult assessmentResult = ConvertToAssessmentResult(request);
        await _repository.saveAttemptToDb(assessmentResult);
        return assessmentResult;
    }
    public AssessmentResult ConvertToAssessmentResult(AssessmentResultRequest request)
    {
        return new AssessmentResult
        {   
            AssessmentId = request.Id,
            ParticipantUniqueCode = request.ParticipantUniqueCode,
            AnswersJson = JsonSerializer.Serialize<int[]>(request.Answers),
            FlaggedQuestionsJson = JsonSerializer.Serialize<int[]>(request.FlaggedQuestions),
            Score = request.Score,
            TimeTaken = request.TimeTaken,
            TimeLimit = request.TimeLimit,
            AttemptStatus = request.AttemptStatus,
            totalScore = request.totalScore
        };
    }
}