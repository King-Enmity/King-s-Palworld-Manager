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

`compose.dev.yaml` builds the current repository into a local development image:

```text
kings-palworld-manager:dev
```

This keeps the repository documentation honest: a user following the root Compose example deploys the same type of artifact we release and support, while contributors have an explicit source-build path.

## Build the current bundle

From `D:\KingsPalworldManager`:

```powershell
$Results = [System.Collections.Generic.List[string]]::new()
$ErrorActionPreference = 'Stop'

try {
    git fetch --all --prune 2>&1 | Out-Null
    git checkout feat/v1-foundation 2>&1 | Out-Null
    git pull --ff-only 2>&1 | Out-Null
    $Results.Add("OK  Branch: $(git branch --show-current)")

    docker compose -f compose.dev.yaml config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Development Compose validation failed.' }
    $Results.Add('OK  compose.dev.yaml validated')

    docker compose -f compose.dev.yaml build
    if ($LASTEXITCODE -ne 0) { throw 'Docker image build failed.' }
    $Results.Add('OK  kings-palworld-manager:dev built')
}
catch {
    $Results.Add("ERROR  $($_.Exception.Message)")
}
finally {
    ''
    '========== KPM DEVELOPMENT BUILD =========='
    $Results
    '==========================================='
}
```

Normal status messages from the helper block are collected and printed at the end. Docker's own build progress remains visible because it is useful for diagnosing build failures.

## Run the development bundle

After a successful build:

```powershell
$Results = [System.Collections.Generic.List[string]]::new()
$ErrorActionPreference = 'Stop'

try {
    docker compose -f compose.dev.yaml up -d
    if ($LASTEXITCODE -ne 0) { throw 'Development stack failed to start.' }
    $Results.Add('OK  Development container started')

    $ContainerState = docker inspect -f '{{.State.Status}}' kings-palworld-manager-dev 2>$null
    $Results.Add("INFO  Container state: $ContainerState")
    $Results.Add('INFO  WebGUI: http://127.0.0.1:8080')
}
catch {
    $Results.Add("ERROR  $($_.Exception.Message)")
}
finally {
    ''
    '========== KPM DEVELOPMENT START ========='
    $Results
    '==========================================='
}
```

Inspect logs separately when needed:

```powershell
docker compose -f compose.dev.yaml logs --tail 200
```

Stop the development container while preserving development volumes:

```powershell
docker compose -f compose.dev.yaml down
```

Delete temporary development state as well:

```powershell
docker compose -f compose.dev.yaml down -v
```

The `-v` form is destructive and is appropriate only while intentionally discarding development data.

## Current bundle scaffold

The root `Dockerfile` currently:

1. builds the React/Vite WebGUI
2. publishes the .NET Manager API as a self-contained Linux x64 application
3. copies the WebGUI into the Manager's static content
4. derives the final image from Pocketpair's pinned official Palworld image
5. adds a signal-aware entrypoint that starts and supervises both the Manager and Palworld processes

The current Pocketpair baseline is intentionally pinned instead of using `latest`.

This is the first runtime scaffold, not the final V1 process-control implementation. The next refactor will move lifecycle ownership and configuration generation into typed Manager services rather than leaving important behavior in shell code.

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

1. Replace the old multi-container runtime assumptions with a single-image Dockerfile/entrypoint. **Scaffold complete.**
2. Consolidate Manager API/background services behind one runtime host where practical.
3. Introduce SQLite persistence and migrations.
4. Implement strongly typed Palworld settings schema and validation.
5. Implement safe Palworld config generation.
6. Implement Palworld lifecycle/process supervision and internal REST connectivity.
7. Connect real server state/actions to the dashboard.
8. Add calendar/scheduler, webhook, wiki, backup, and update modules.
9. Add automated image build, tests, scanning, and GHCR publishing.
10. Publish the first V1 pre-release image only after an end-to-end clean deployment test.
