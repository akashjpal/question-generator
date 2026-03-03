using AttemptAPI.dtos.request;
using AttemptAPI.Models;
namespace AttemptAPI.services;

public interface ISubmitAssessmentService
{
    public Task<AssessmentResult> SaveAssessment(AssessmentResultRequest request);
    public Task<AssessmentResult> ConvertToAssessmentResult(AssessmentResultRequest request);
}