using Microsoft.AspNetCore.Mvc;
using AttemptAPI.Models;
using System.Text.Json;

namespace AttemptAPI.controllers;
[ApiController]
[Route("api/attempts")]
public class AttemptController: ControllerBase
{
    [HttpGet("healthCheck")]
    public string HealthCheck()
    {
        return " running";
    }

    [HttpPost("save/{assessmentId}")]
    public string SaveAttempt(string assessmentId, [FromBody] AssessmentResult assessmentResult)
    {
        Console.WriteLine(assessmentId);
        string serializedObject = JsonSerializer.Serialize(assessmentResult, new JsonSerializerOptions { WriteIndented = true });
        Console.WriteLine($"Assessment Result: {serializedObject}");
        return "Assessment saved successfully";
    }

    [HttpPost("submit/{assessmentId}")]
    public string SubmitAssessment(string assessmentId, [FromBody] AssessmentResult assessmentResult)
    {
        Console.WriteLine(assessmentId);
        string serializedObject = JsonSerializer.Serialize(assessmentResult, new JsonSerializerOptions { WriteIndented = true });
        Console.WriteLine($"Assessment Result: {serializedObject}");
        return "Assessment submitted successfully";
    }
}