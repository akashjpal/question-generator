namespace ReportsAPI.DTOs.response;

public class DashBoardStatsResponse
{
    public int TotalAssessments { get; set; }
    public int TotalParticipants { get; set; }
    public double AveragePerformance { get; set; }
    public int CompletionRate { get; set; }
    public RecentAssessmentReport[] RecentActivity { get; set; }
}
