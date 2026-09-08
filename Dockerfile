ARG PALWORLD_IMAGE=ghcr.io/pocketpairjp/palserver:v1.0.4.102642

FROM node:24-alpine AS web-build
WORKDIR /src/web
COPY src/web/package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund
COPY src/web/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS manager-build
WORKDIR /src/backend
COPY src/backend/Api/KingPalworldManager.Api.csproj ./Api/KingPalworldManager.Api.csproj
COPY src/backend/Api/ ./Api/
COPY --from=web-build /src/web/dist ./Api/wwwroot
RUN dotnet publish ./Api/KingPalworldManager.Api.csproj \
    --configuration Release \
    --runtime linux-x64 \
    --self-contained true \
    --output /out/manager \
    /p:PublishSingleFile=false \
    /p:DebugType=None \
    /p:DebugSymbols=false

FROM ${PALWORLD_IMAGE} AS runtime

USER root
RUN mkdir -p /manager/app /manager/data \
    && chown -R user:usergroup /manager

COPY --from=manager-build --chown=user:usergroup /out/manager/ /manager/app/
COPY --chown=user:usergroup scripts/docker-entrypoint.sh /pal/kpm-entrypoint.sh
RUN chmod 0755 /pal/kpm-entrypoint.sh

ENV ASPNETCORE_URLS=http://0.0.0.0:8080 \
    DOTNET_EnableDiagnostics=0 \
    KPM_DATA_PATH=/manager/data \
    KPM_STEAM_APP_ID=1623730

EXPOSE 8080/tcp 8211/udp 27015/udp

USER user
ENTRYPOINT ["/pal/kpm-entrypoint.sh"]
CMD ["-port=8211", "-useperfthreads", "-NoAsyncLoadingThread", "-UseMultithreadForDS"]
