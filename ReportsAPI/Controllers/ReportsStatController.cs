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
            return BadRequest(new { message = "An error occurred while fetching dashboard stats.", details = ex.Message });
        }
    }
}