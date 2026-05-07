namespace ReportsAPI.Controllers;

using Microsoft.AspNetCore.Mvc;
using ReportsAPI.DTOs.response;
using ReportsAPI.Services;

[ApiController]
[Route("api")]
public class ReportsController(IDashBoardStatsService dashBoardStatsService, ILogger<ReportsController> logger) : ControllerBase
{
    [HttpGet("dashboard/stats")]
    public async Task<ActionResult<DashBoardStatsResponse>> GetStats()
    {
        try
        {
            DashBoardStatsResponse response = await dashBoardStatsService.GetDashBoardStats();
            return Ok(response);
        }
        catch (Exception ex)
        {
            // Log full exception chain so we can see Npgsql / Supabase errors in the console
            logger.LogError(ex, "GET /api/dashboard/stats failed");
            return StatusCode(500, new
            {
                message = "Failed to fetch dashboard stats.",
                details = ex.InnerException?.Message ?? ex.Message
            });
        }
    }

    [HttpGet("dashboard/stats/{id:long}")]
    public async Task<ActionResult<AssessmentResponse>> GetStatsOfAssessment(long id)
    {
        try
        {
            AssessmentResponse response = await dashBoardStatsService.GetAssessmentStats(id);
            return Ok(response);
        }
        catch (KeyNotFoundException ex)
        {
            Console.WriteLine($"Assessment {id} not found: {ex.Message}");
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "GET /api/dashboard/stats/{Id} failed", id);
            return StatusCode(500, new
            {
                message = $"Failed to fetch stats for assessment {id}.",
                details = ex.InnerException?.Message ?? ex.Message
            });
        }
    }
}
