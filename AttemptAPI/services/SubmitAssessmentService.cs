using AttemptAPI.dtos.request;
using AttemptAPI.Models;
using AttemptAPI.repository;
using System.Text.Json;
namespace AttemptAPI.services;

public class SubmitAssessmentService : ISubmitAssessmentService
{
    private readonly IAssessmentRepository _repository;
    public SubmitAssessmentService(IAssessmentRepository repository) {
        this._repository = repository;
    }
    public async Task<AssessmentResult> SaveAssessment(AssessmentResultRequest request)
    {
        AssessmentResult assessmentResult = await ConvertToAssessmentResult(request);
        return assessmentResult;
    }
    public async Task<AssessmentResult> ConvertToAssessmentResult(AssessmentResultRequest request)
    {
        return new AssessmentResult
        {   
            Id = request.Id,
            ParticipantUniqueCode = request.ParticipantUniqueCode,
            AnswersJson = JsonSerializer.Serialize<int[]>(request.Answers),
            FlaggedQuestionsJson = JsonSerializer.Serialize<int[]>(request.FlaggedQuestions),
            Score = request.Score,
            TimeTaken = request.TimeTaken,
            TimeLimit = request.TimeLimit,
            AttemptStatus = request.AttemptStatus
        };
    }
}