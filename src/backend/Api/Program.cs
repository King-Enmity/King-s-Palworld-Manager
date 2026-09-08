using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddHttpClient("steam", client =>
{
    client.BaseAddress = new Uri("https://store.steampowered.com/");
    client.Timeout = TimeSpan.FromSeconds(10);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("KingsPalworldManager/0.1");
});

var app = builder.Build();
app.UseExceptionHandler();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "kpm-manager",
    utc = DateTimeOffset.UtcNow
}));

var api = app.MapGroup("/api/v1");

api.MapGet("/system/overview", () => Results.Ok(new
{
    product = "King's Palworld Manager",
    version = "0.1.0-dev",
    edition = "self-hosted",
    runtime = "single-image",
    persistence = "sqlite-planned",
    authentication = "disabled-v1",
    modules = new[] { "dashboard", "server", "scheduler", "webhooks", "wiki", "steam-metadata" }
}));

api.MapGet("/steam/metadata", async (IHttpClientFactory factory, IConfiguration config, CancellationToken cancellationToken) =>
{
    var rawAppId = config["Steam:AppId"] ?? config["KPM_STEAM_APP_ID"] ?? "1623730";
    if (!int.TryParse(rawAppId, out var appId) || appId <= 0)
    {
        return Results.Problem("Steam App ID configuration is invalid.", statusCode: 500);
    }

    var client = factory.CreateClient("steam");
    using var response = await client.GetAsync($"api/appdetails?appids={appId}&l=english", cancellationToken);
    response.EnsureSuccessStatusCode();

    await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
    using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

    if (!document.RootElement.TryGetProperty(appId.ToString(), out var app) ||
        !app.TryGetProperty("success", out var success) || !success.GetBoolean() ||
        !app.TryGetProperty("data", out var data))
    {
        return Results.NotFound(new { message = "Steam metadata is unavailable for the configured app." });
    }

    static string? StringOrNull(JsonElement parent, string name) =>
        parent.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    var screenshots = data.TryGetProperty("screenshots", out var screenshotsElement)
        ? screenshotsElement.EnumerateArray()
            .Take(12)
            .Select(x => StringOrNull(x, "path_full"))
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToArray()
        : [];

    var movies = data.TryGetProperty("movies", out var moviesElement)
        ? moviesElement.EnumerateArray()
            .Take(6)
            .Select(x => new
            {
                name = StringOrNull(x, "name"),
                thumbnail = StringOrNull(x, "thumbnail")
            })
            .ToArray()
        : [];

    var genres = data.TryGetProperty("genres", out var genresElement)
        ? genresElement.EnumerateArray().Select(x => StringOrNull(x, "description")).Where(x => x is not null).ToArray()
        : [];

    return Results.Ok(new
    {
        appId,
        name = StringOrNull(data, "name"),
        shortDescription = StringOrNull(data, "short_description"),
        headerImage = StringOrNull(data, "header_image"),
        capsuleImage = StringOrNull(data, "capsule_image"),
        website = StringOrNull(data, "website"),
        genres,
        screenshots,
        movies,
        fetchedAtUtc = DateTimeOffset.UtcNow
    });
});

app.MapFallbackToFile("index.html");

app.Run();
