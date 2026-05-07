namespace ReportsAPI.DTOs.response;
public class AssessmentResponse
{
    public long id { get; set; }
    public string title { get; set; }
    public string subject { get; set; }
    public string date { get; set; }
    public int participants { get; set; }
    public double avgScore { get; set; }
    public double highestScore { get; set; }
    public double lowestScore { get; set; }
    public StudentResult[] studentResults { get; set; }
}