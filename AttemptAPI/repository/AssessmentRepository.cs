using AttemptAPI.dtos.request;
using AttemptAPI.dtos.request;
using AttemptAPI.Models;
using AttemptAPI.services;
using AttemptAPI.Models;
namespace AttemptAPI.repository;
public class AssessmentRepository: IAssessmentRepository
{
    public AssessmentRepository()
    {
    }

    public AssessmentResult saveAttemptToDb(AssessmentResult request)
    {
        // save here into db
        return request;
    }
}

    
