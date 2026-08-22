using AttemptAPI.services;
using AttemptAPI.repository;
using Npgsql;
using Amazon.SecretsManager;
using Amazon.SecretsManager.Model;
using Amazon.Runtime;
var builder = WebApplication.CreateBuilder(args);

using (var secretsClient = new AmazonSecretsManagerClient(
    new BasicAWSCredentials(
        builder.Configuration["AWS_ACCESS_KEY_ID"],
        builder.Configuration["AWS_SECRET_ACCESS_KEY"]),
    new AmazonSecretsManagerConfig { ServiceURL = builder.Configuration["AWS_ENDPOINT"] }))
{
    var secretResponse = await secretsClient.GetSecretValueAsync(new GetSecretValueRequest
    {
        SecretId = "question-generator/database-connection-string"
    });
    builder.Configuration["ConnectionStrings:DefaultConnection"] = secretResponse.SecretString;
}

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
