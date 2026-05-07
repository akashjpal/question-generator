namespace ReportsAPI.Services;
using ReportsAPI.DTOs.response;
public interface IDashBoardStatsService
{
    public Task<DashBoardStatsResponse> GetDashBoardStats();
    public Task<AssessmentResponse> GetAssessmentStats(long id);
}