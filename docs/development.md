# Development Guide

This document is for contributors working on King's Palworld Manager source code. End users of released versions should follow `docs/deployment.md` and pull the published image instead of cloning/building the repository.

## Windows workspace

Primary development path:

```text
D:\KingsPalworldManager
```

Recommended tools:

- Git
- Docker Desktop / Docker Engine with Compose v2
- PowerShell 7+
- .NET SDK 10
- Node.js LTS for direct frontend development

## Clone the development repository

```powershell
git clone https://github.com/King-Enmity/King-s-Palworld-Manager.git D:\KingsPalworldManager
Set-Location D:\KingsPalworldManager
git checkout feat/v1-foundation
```

## Consumer vs development Compose

`compose.yaml` is intentionally the **consumer example** and references the published GHCR image.

Source development must not modify it into a local-build-only file. Development-specific build topology belongs in `compose.dev.yaml` and other files clearly named for development.

This keeps the repository documentation honest: a user following the root Compose example should deploy the same artifact that we release and support.

## Development principles

- The released product is one Docker image for V1.
- Code remains modular even when packaged into one image.
- Temporary development data can be discarded during the current refactor phase.
- Database migrations should still be used/tested from the start.
- Never commit `.env`, secrets, worlds, logs, generated databases, or backups.
- Never expose Palworld REST port 8212 publicly.
- Validate all settings before generating configuration or spawning processes.
- Prefer PowerShell for repository/deployment helper scripts.
- When scripts run multiple commands, collect normal status output and print the consolidated results at the end.

## Branch/PR workflow

Current foundation work is on:

```text
feat/v1-foundation
```

The draft PR stays unmerged until the single-image runtime builds and operates end-to-end.

Recommended future flow:

```text
main
  |
  +-- feature branches
       |
       +-- pull request
            |
            +-- build/test/security checks
                 |
                 +-- merge
```

Release tags should be created from a tested `main` commit, not from ad-hoc local builds.

## Immediate implementation sequence

1. Replace the old multi-container runtime assumptions with a single-image Dockerfile/entrypoint.
2. Consolidate the Manager API/background services behind one runtime host where practical.
3. Introduce SQLite persistence and migrations.
4. Implement strongly typed Palworld settings schema and validation.
5. Implement safe Palworld config generation.
6. Implement Palworld lifecycle/process supervision and internal REST connectivity.
7. Connect real server state/actions to the dashboard.
8. Add calendar/scheduler, webhook, wiki, backup, and update modules.
9. Add automated image build, tests, scanning, and GHCR publishing.
10. Publish the first V1 pre-release image only after an end-to-end clean deployment test.
