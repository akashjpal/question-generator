namespace AttemptAPI.dtos.request;


public class AssessmentResultRequest
{
    public long Id { get; set; }
    public string ParticipantUniqueCode { get; set; } // assessment code + unique id
    public int[] Answers { get; set; }
    public int[] FlaggedQuestions { get; set; }
    public int Score { get; set; }
    public int TimeTaken { get; set; }
    public int TimeLimit { get; set; }
    public int AttemptStatus { get; set; }
    public int totalScore { get; set; }
}

