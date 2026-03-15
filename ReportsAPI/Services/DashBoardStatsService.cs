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

    public async Task<AssessmentResponse> GetAssessmentStats(int id)
    {
        try
        {
            AssessmentResponse response = await _dashboardStatsRepository.GetAssessmentStats(id);
            response.studentResults = await _dashboardStatsRepository.GetAssessmentStatsOfStudent(id);
            for(int i=0; i<response.studentResults.Length; i++)
            {
                response.studentResults[i].time = TimeSpan.FromSeconds(double.Parse(response.studentResults[i].time)).ToString(@"mm\:ss");
                if(response.studentResults[i].score >= 75)
                {
                    response.studentResults[i].status = "Passed";
                }
                else
                {
                    response.studentResults[i].status = "Failed";
                }
            }
            response.participants = response.studentResults.Length;
            return response;
        }
        catch(Exception ex)
        {
            // Log the exception
            throw new Exception("An error occurred while fetching assessment stats.", ex);
        }
    }
}