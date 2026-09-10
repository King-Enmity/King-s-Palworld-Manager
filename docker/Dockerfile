# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        g++ \
        make \
        python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
COPY src/shared/package.json ./src/shared/package.json
COPY src/server/package.json ./src/server/package.json
COPY src/web/package.json ./src/web/package.json

RUN npm ci

COPY tsconfig.base.json ./tsconfig.base.json
COPY src ./src

RUN npm run build
RUN npm prune --omit=dev


FROM node:24-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV HOME=/home/kpm

RUN dpkg --add-architecture i386 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gosu \
        lib32gcc-s1 \
        lib32stdc++6 \
        libc6-i386 \
        libcurl4 \
        libicu72 \
        tini \
    && rm -rf /var/lib/apt/lists/*

RUN useradd \
        --create-home \
        --uid 10001 \
        --shell /bin/bash \
        kpm \
    && mkdir -p \
        /app \
        /manager/data \
        /pal/Package \
        /opt/steamcmd \
    && chown -R kpm:kpm \
        /manager \
        /pal \
        /opt/steamcmd

RUN curl \
        --fail \
        --silent \
        --show-error \
        --location \
        https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz \
    | tar \
        -xz \
        -C /opt/steamcmd \
    && chown -R kpm:kpm /opt/steamcmd

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules

COPY --from=build /app/src/shared/package.json ./src/shared/package.json
COPY --from=build /app/src/shared/dist ./src/shared/dist

COPY --from=build /app/src/server/package.json ./src/server/package.json
COPY --from=build /app/src/server/dist ./src/server/dist

COPY --from=build /app/src/web/dist ./web

COPY docker/kpm-entrypoint.sh /usr/local/bin/kpm-entrypoint

RUN chmod +x /usr/local/bin/kpm-entrypoint

ENV KPM_BIND_ADDRESS=0.0.0.0
ENV KPM_HTTP_PORT=8080
ENV KPM_WEB_ROOT=/app/web
ENV KPM_DATA_PATH=/manager/data
ENV KPM_DB_FILENAME=kpm.db
ENV KPM_PALWORLD_ROOT=/pal/Package
ENV KPM_PALWORLD_GAME_PORT=8211
ENV KPM_PALWORLD_QUERY_PORT=27015
ENV KPM_PALWORLD_REST_PORT=8212
ENV KPM_PALWORLD_REST_USERNAME=admin
ENV KPM_STEAM_UPDATE_ON_START=1

EXPOSE 8080/tcp
EXPOSE 8211/udp
EXPOSE 27015/udp

VOLUME ["/manager/data", "/pal"]

HEALTHCHECK \
    --interval=15s \
    --timeout=5s \
    --start-period=20s \
    --retries=5 \
    CMD curl --fail --silent http://127.0.0.1:8080/ready > /dev/null || exit 1

STOPSIGNAL SIGTERM

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/kpm-entrypoint"]

CMD ["node", "/app/src/server/dist/index.js"]