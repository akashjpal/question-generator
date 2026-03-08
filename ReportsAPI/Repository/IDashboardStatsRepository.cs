namespace ReportsAPI.Repository;
using ReportsAPI.DTOs.response;
public interface IDashboardStatsRepository
{
    Task<DashBoardStatsResponse> GetDashboardStats();
    Task<RecentAssessmentReport[]> GetRecentAssessments();
}