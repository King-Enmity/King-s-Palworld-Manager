# Deployment Guide

This document describes the **consumer** deployment model for King's Palworld Manager.

> The first public image has not been released yet. Until a release exists, use `docs/development.md` instead.

## Requirements

- Docker Engine or Docker Desktop with Docker Compose v2
- Enough CPU/RAM/storage for Palworld itself
- UDP game/query ports allowed through the host firewall as required

## Recommended Compose deployment

Create a directory for your deployment and place `compose.yaml` plus a `.env` file in it.

The supplied `compose.yaml` pulls:

```text
ghcr.io/king-enmity/kings-palworld-manager:${KPM_IMAGE_TAG:-latest}
```

It does not build source code locally.

Copy `.env.example` to `.env`, then change at minimum:

```text
KPM_ADMIN_PASSWORD
KPM_SERVER_NAME
TZ
```

If the server should require a player password, also set:

```text
KPM_SERVER_PASSWORD
```

Start the service:

```powershell
docker compose pull
docker compose up -d
```

Inspect status:

```powershell
docker compose ps
docker compose logs --tail 100
```

## Management WebGUI

Default:

```text
http://127.0.0.1:8080
```

V1 intentionally has no application login/authentication. The management interface therefore binds to loopback by default.

Do not change `KPM_BIND_ADDRESS` to `0.0.0.0` and expose the UI to the public Internet unless you place it behind an appropriate trusted access layer. A later public edition will add native authentication/authorization.

## Game ports

Default mappings:

```text
8211/udp   Palworld game traffic
27015/udp  Palworld query traffic
```

The Palworld REST management API is internal to the container and is not mapped to a host port.

## Persistent storage

The example Compose file uses Docker volumes:

```text
manager-data -> /manager/data
palworld-saved -> /pal/Package/Pal/Saved
```

Deleting/recreating the container does not remove these volumes.

Manager data includes the SQLite database and manager-owned state. Palworld data includes world saves and Palworld configuration.

## Updating

For a normal release update:

```powershell
docker compose pull
docker compose up -d
```

The container is treated as replaceable. Persistent state belongs in the mounted volumes.

Pin `KPM_IMAGE_TAG` to a specific version if you do not want automatic adoption of the newest `latest` image when manually pulling.

Example:

```text
KPM_IMAGE_TAG=1.0.0
```

## Backups

King's Manager will provide application-managed backups in V1. Until that feature is complete, backing up both persistent volumes is required for a full deployment backup.

Never rely on the writable container layer for data that must survive an upgrade.

## Uninstalling

Stop/remove the container while preserving data:

```powershell
docker compose down
```

Removing the volumes permanently deletes persisted server/manager data:

```powershell
docker compose down -v
```

Use the `-v` form only when intentionally deleting the deployment.
