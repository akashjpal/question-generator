namespace ReportsAPI.Services;

using Microsoft.Extensions.Caching.Memory;
using ReportsAPI.DTOs.response;
using ReportsAPI.Repository;

public class DashBoardStatsService(IDashboardStatsRepository dashboardStatsRepository, IMemoryCache cache) : IDashBoardStatsService
{
    private static readonly MemoryCacheEntryOptions ShortCacheOptions =
        new MemoryCacheEntryOptions().SetAbsoluteExpiration(TimeSpan.FromSeconds(30));

    private static readonly MemoryCacheEntryOptions AssessmentCacheOptions =
        new MemoryCacheEntryOptions().SetAbsoluteExpiration(TimeSpan.FromSeconds(5));

    public async Task<DashBoardStatsResponse> GetDashBoardStats()
    {
        // Cache the entire dashboard response (full-table-scan query + recent assessments).
        // 30s TTL keeps data fresh enough while eliminating repeat scans.
        const string cacheKey = "dashboard:stats";
        if (cache.TryGetValue(cacheKey, out DashBoardStatsResponse? cached) && cached is not null)
            return cached;

        // Single connection runs both queries — no double TLS handshake
        var (stats, recent) = await dashboardStatsRepository.GetDashboardDataAsync();
        stats.RecentActivity = recent;

        cache.Set(cacheKey, stats, ShortCacheOptions);
        return stats;
    }

    public async Task<AssessmentResponse> GetAssessmentStats(long id)
    {
        // Assessment results are immutable after submission — safe to cache for 60s
        string cacheKey = $"assessment:{id}";
        if (cache.TryGetValue(cacheKey, out AssessmentResponse? cached) && cached is not null)
            return cached;

        AssessmentResponse result = await dashboardStatsRepository.GetAssessmentStats(id);
        cache.Set(cacheKey, result, AssessmentCacheOptions);
        return result;
    }
}
