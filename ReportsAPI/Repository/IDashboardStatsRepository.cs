namespace ReportsAPI.Repository;
using ReportsAPI.DTOs.response;
public interface IDashboardStatsRepository
{
    Task<(DashBoardStatsResponse stats, RecentAssessmentReport[] recent)> GetDashboardDataAsync();
    Task<AssessmentResponse> GetAssessmentStats(long id);
}