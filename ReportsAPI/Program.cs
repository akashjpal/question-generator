using ReportsAPI.Repository;
using ReportsAPI.Services;
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
builder.Services.AddMemoryCache();
builder.Services.AddScoped<IDashBoardStatsService, DashBoardStatsService>();
builder.Services.AddScoped<IDashboardStatsRepository, DashboardStatsRepository>();

// Register NpgsqlDataSource — tuned for Supabase Supavisor (Transaction-mode pooler on port 6543).
builder.Services.AddSingleton<NpgsqlDataSource>(sp =>
{
    var raw = builder.Configuration.GetConnectionString("DefaultConnection") ?? "";
    var csb = new NpgsqlConnectionStringBuilder(raw)
    {
        // ── Supavisor compatibility (Transaction mode) ────────────────
        // Supavisor reassigns the backend connection per-transaction,
        // so prepared statements and session state don't survive across calls.
        Multiplexing = false,
        NoResetOnClose = true,

        // ── Connection pool settings ──────────────────────────────────
        Pooling = true,
        MinPoolSize = 2,
        MaxPoolSize = 10,
        ConnectionIdleLifetime = 300,

        // ── Timeouts (generous for remote Supabase + cold starts) ─────
        Timeout = 30,           // seconds to wait for a connection to open
        CommandTimeout = 30,    // default per-command timeout

        // ── SSL (required by Supabase) ────────────────────────────────
        SslMode = SslMode.Require
    };

    return NpgsqlDataSource.Create(csb.ConnectionString);
});

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
var app = builder.Build();

// ── Warm up the connection pool at startup ────────────────────────
// Opens one connection to Supabase during boot so the first HTTP request
// doesn't pay the full TLS + auth penalty. Failures are logged, not fatal.
_ = Task.Run(async () =>
{
    try
    {
        var ds = app.Services.GetRequiredService<NpgsqlDataSource>();
        using var conn = await ds.OpenConnectionAsync();
        app.Logger.LogInformation("Database connection pool warmed up successfully.");
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Database warmup failed — first request will be slower.");
    }
});

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
