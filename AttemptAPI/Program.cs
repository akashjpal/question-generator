using AttemptAPI.services;
using AttemptAPI.repository;
using Npgsql;
var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
var corsOrigins = builder.Configuration.GetValue<string>("CorsOrigins") ?? "http://localhost:4200";
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", builder =>
    {
        builder.WithOrigins(corsOrigins.Split(','))
               .AllowAnyHeader()
               .AllowAnyMethod();
    });
});
builder.Services.AddScoped<ISubmitAssessmentService, SubmitAssessmentService>();
builder.Services.AddScoped<IAssessmentRepository, AssessmentRepository>();
// Register NpgsqlDataSource
builder.Services.AddSingleton<NpgsqlDataSource>(sp =>
{
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
    return NpgsqlDataSource.Create(connectionString);
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowFrontend");
app.UseAuthorization();

app.MapControllers();
app.Run();
