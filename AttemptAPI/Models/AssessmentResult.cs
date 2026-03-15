namespace AttemptAPI.Models;


public class AssessmentResult
{
    public int AssessmentId { get; set; }
    public string ParticipantUniqueCode { get; set; } // assessment code + unique id
    public string AnswersJson { get; set; }
    public string FlaggedQuestionsJson { get; set; }
    public int Score { get; set; }
    public int TimeTaken { get; set; }
    public int TimeLimit { get; set; }
    public int AttemptStatus { get; set; }
    public int totalScore { get; set; }
}

