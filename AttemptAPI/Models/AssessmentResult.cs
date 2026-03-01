namespace AttemptAPI.Models;

public class AssessmentResult
{

    public string Id { get; set; }
    public string ParticipantName { get; set; }
    public int[] Answers { get; set; }
    public int[] FlaggedQuestions { get; set; }
    public int Score { get; set; }
    public int TimeTaken { get; set; }
    public int TimeLimit { get; set; }

    public int AttemptStatus { get; set; }
}
