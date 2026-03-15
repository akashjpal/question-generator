using Microsoft.AspNetCore.Mvc;

namespace ReportsAPI.Controllers;

using ReportsAPI.DTOs.response;
using ReportsAPI.Services;

[ApiController]
[Route("api")]
public class ReportsController : ControllerBase
{
    private readonly IDashBoardStatsService _dashBoardStatsService;
    public ReportsController(IDashBoardStatsService dashBoardStatsService)
    {
        _dashBoardStatsService = dashBoardStatsService;
    }

    [HttpGet("dashboard/stats")]
    public async Task<ActionResult<DashBoardStatsResponse>> GetStats()
    {
        try
        {
            DashBoardStatsResponse response = await _dashBoardStatsService.GetDashBoardStats();
            return Ok(response);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while fetching dashboard stats.", details = ex.Message });
        }
    }

    [HttpGet("dashboard/stats/{id}")]
    public async Task<ActionResult<AssessmentResponse>> GetStatsOfAssessment(int id)
    {
        try
        {
            Console.WriteLine($"Received request for dashboard stats of assessment with ID: {id}");
            AssessmentResponse response = await _dashBoardStatsService.GetAssessmentStats(id);
            return Ok(response);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while fetching dashboard stats.", details = ex.Message });
        }
    }
}