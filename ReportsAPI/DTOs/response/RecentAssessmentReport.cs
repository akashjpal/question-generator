namespace ReportsAPI.DTOs.response;
public class RecentAssessmentReport {
    public long Id { get; set; }
    public string Title { get; set; }
    public string Subject { get; set; }
    public int Participants { get; set; }
    public double AvgScore { get; set; }
    public string CreatedAt { get; set; }
}