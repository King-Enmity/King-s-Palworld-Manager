FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src
COPY Api/KingPalworldManager.Api.csproj Api/
RUN dotnet restore Api/KingPalworldManager.Api.csproj
COPY Api/ Api/
RUN dotnet publish Api/KingPalworldManager.Api.csproj -c Release -o /out --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app
COPY --from=build /out .
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "KingPalworldManager.Api.dll"]
