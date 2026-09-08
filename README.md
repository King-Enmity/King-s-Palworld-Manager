# King's Palworld Manager

A modular, self-hosted Palworld dedicated-server manager with a modern web UI.

> V1 is under active development. The self-hosted edition intentionally does not include application login/authentication, so the management UI is bound to loopback by default and must not be exposed directly to the public Internet.

## V1 foundation

The current foundation branch contains:

- React/Vite dashboard shell
- .NET 10 control API
- Separate .NET scheduler/background worker
- PostgreSQL persistence layer
- Caddy management gateway
- Pocketpair official Palworld server image
- Private Docker network for Palworld REST traffic
- Steam metadata normalization endpoint
- PowerShell-first Windows bootstrap
- Security and validation architecture notes

## Local path

Recommended project location on Windows:

```text
D:\KingsPalworldManager
```

## Bootstrap

From PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
irm https://raw.githubusercontent.com/King-Enmity/King-s-Palworld-Manager/feat/v1-foundation/scripts/Initialize-Kpm.ps1 | iex
```

The script clones the repository into `D:\KingsPalworldManager`, checks out `feat/v1-foundation`, creates `.env` from the template if needed, validates Docker Compose syntax, and prints all setup results together at the end.

Before starting containers, replace every placeholder password in `.env`.

## Start the foundation stack

```powershell
Set-Location D:\KingsPalworldManager
docker compose build
docker compose up -d
docker compose ps
```

The management UI defaults to:

```text
http://127.0.0.1:8080
```

## Important development status

The UI foundation and Steam metadata path are implemented. Palworld REST lifecycle controls, settings-file provisioning, durable scheduling, wiki storage, webhook delivery, backup/restore, and migrations are the next implementation slices.

See `docs/architecture.md` for module boundaries and security rules.
