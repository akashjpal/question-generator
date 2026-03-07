using AttemptAPI.Models;
namespace AttemptAPI.repository;
public interface IAssessmentRepository
{
    public Task<AssessmentResult> saveAttemptToDb(AssessmentResult request);
}