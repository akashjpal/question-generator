namespace ReportsAPI.Repository;
using ReportsAPI.DTOs.response;
public interface IDashboardStatsRepository
{
    Task<DashBoardStatsResponse> GetDashboardStats();
    Task<RecentAssessmentReport[]> GetRecentAssessments();
    Task<AssessmentResponse> GetAssessmentStats(int id);
    Task<StudentResult[]> GetAssessmentStatsOfStudent(int id);
}