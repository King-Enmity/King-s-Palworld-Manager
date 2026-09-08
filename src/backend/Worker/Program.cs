var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddHostedService<SchedulerWorker>();

var host = builder.Build();
host.Run();

sealed class SchedulerWorker(ILogger<SchedulerWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("King's Palworld Manager worker started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }
}
