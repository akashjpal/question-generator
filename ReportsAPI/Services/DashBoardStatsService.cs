namespace ReportsAPI.Services;
using ReportsAPI.DTOs.response;
using ReportsAPI.Repository;
public class DashBoardStatsService: IDashBoardStatsService
{
    private readonly IDashboardStatsRepository _dashboardStatsRepository;
    public DashBoardStatsService(IDashboardStatsRepository dashboardStatsRepository)
    {
        _dashboardStatsRepository = dashboardStatsRepository;
    }

    public async Task<DashBoardStatsResponse> GetDashBoardStats()
    {
        try
        {
            DashBoardStatsResponse response = await _dashboardStatsRepository.GetDashboardStats();
            response.RecentActivity = await _dashboardStatsRepository.GetRecentAssessments();
            return response;
        }
        catch(Exception ex)
        {
            // Log the exception
            throw new Exception("An error occurred while fetching dashboard stats.", ex);
        }
    }
}