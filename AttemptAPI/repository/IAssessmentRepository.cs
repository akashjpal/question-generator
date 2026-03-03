using AttemptAPI.Models;
namespace AttemptAPI.repository;
public interface IAssessmentRepository
{
    public AssessmentResult saveAttemptToDb(AssessmentResult request);
}