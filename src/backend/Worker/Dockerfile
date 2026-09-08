FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src
COPY Worker/KingPalworldManager.Worker.csproj Worker/
RUN dotnet restore Worker/KingPalworldManager.Worker.csproj
COPY Worker/ Worker/
RUN dotnet publish Worker/KingPalworldManager.Worker.csproj -c Release -o /out --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/runtime:10.0-alpine AS runtime
WORKDIR /app
COPY --from=build /out .
USER $APP_UID
ENTRYPOINT ["dotnet", "KingPalworldManager.Worker.dll"]
