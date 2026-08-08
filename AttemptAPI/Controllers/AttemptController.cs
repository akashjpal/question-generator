using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using AttemptAPI.dtos.request;
using AttemptAPI.services;
using AttemptAPI.Enums;

namespace AttemptAPI.controllers;

[ApiController]
[Route("api/attempts")]
public class AttemptController : ControllerBase
{
    private readonly ISubmitAssessmentService _assessmentService;
    public AttemptController(ISubmitAssessmentService assessmentService)
    {
        this._assessmentService = assessmentService;
    }

    [HttpGet("healthCheck")]
    public string HealthCheck()
    {
        return "running";
    }

    [HttpPost("save")]
    public async Task<IActionResult> SaveAttempt([FromBody] AssessmentResultRequest assessmentResult)
    {
        try
        {
            Console.WriteLine($"Received assessment result: {JsonSerializer.Serialize(assessmentResult)}");
            await _assessmentService.SaveAssessment(assessmentResult);
            return Ok(new { message = "Assessment saved successfully" });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error saving assessment: {ex.Message}");
            return BadRequest(new { message = "Error saving assessment" });
        }
    }

    [HttpPost("submit")]
    public async Task<IActionResult> SubmitAssessment([FromBody] AssessmentResultRequest assessmentResult)
    {
        try
        {
            Console.WriteLine($"Received assessment result: {JsonSerializer.Serialize(assessmentResult)}");
            await _assessmentService.SaveAssessment(assessmentResult);
            return Ok(new { message = "Assessment submitted successfully" });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error while submitting assessment: {ex.Message}");
            return BadRequest(new { message = "Error while submitting assessment" });
        }
    }
}