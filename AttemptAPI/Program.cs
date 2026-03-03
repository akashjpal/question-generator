using AttemptAPI.services;
using AttemptAPI.repository;
var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowLocalhost4200", builder =>
    {
        builder.WithOrigins("http://localhost:4200") // Allow requests from localhost:4200
               .AllowAnyHeader() // Allow all headers
               .AllowAnyMethod(); // Allow all HTTP methods (GET, POST, etc.)
    });
});
builder.Services.AddScoped<ISubmitAssessmentService, SubmitAssessmentService>();
builder.Services.AddScoped<IAssessmentRepository, AssessmentRepository>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseCors("AllowLocalhost4200");
app.UseAuthorization();

app.MapControllers();
app.Run();
