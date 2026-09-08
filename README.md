# King's Palworld Manager

King's Palworld Manager is a self-hosted **Palworld dedicated server + modern management WebGUI distributed as a Docker image**.

The GitHub repository is the development, documentation, issue-tracking, and release home. End users should not need to clone the source repository to run a released version.

> **Development status:** V1 is under active construction. The public Docker image described below will be published when the first runnable release is ready. Until then, use the development workflow in `docs/development.md`.

## Product model

The target end-user experience is intentionally simple:

```text
Docker / Docker Compose
        |
        v
+---------------------------------------------+
| King's Palworld Manager container           |
|                                             |
|  Manager WebGUI + API + background jobs     |
|        |                                    |
|        +--> SQLite manager database         |
|        +--> Palworld REST API (internal)    |
|        +--> Steam metadata                  |
|        +--> webhooks / wiki / scheduler     |
|        +--> save import/export              |
|                                             |
|  Palworld Dedicated Server                  |
+---------------------------------------------+
        |
        +--> /manager/data       persistent manager data
        +--> Palworld Saved      world/player/config data
```

The released image will wrap a pinned official Pocketpair Palworld server image rather than asking users to assemble several application containers themselves.

## V1 goals

V1 is designed for self-hosters running a server for themselves and friends. Planned V1 capabilities include:

- modern responsive WebGUI
- Palworld server start/stop/restart and health
- player/server status
- validated Palworld settings editor
- scheduled configuration changes and maintenance calendar
- Discord/generic webhook delivery and delivery history
- built-in wiki/content pages
- wiki content usable by webhook/forum-style announcements where supported
- backups, restore points, and update controls
- **world-save export and import**
- **individual player-save export and import**
- save-package validation, compatibility checks, and pre-import safety snapshots
- Steam metadata such as artwork, descriptions, genres/tags, screenshots, and trailers where useful
- event/audit history
- SQLite persistence for manager state

Application login/authentication is intentionally deferred for the first self-hosted release. Security controls still start in V1: strict input validation, secret hygiene, SSRF protections, safe process invocation, internal-only Palworld REST access, conservative network exposure, and defensive validation of uploaded save archives.

## Save portability

V1 treats server data portability as a first-class feature rather than only a backup feature.

The WebGUI will provide separate flows for:

- exporting a complete world/save package
- importing a complete world/save package
- exporting one player's save data
- importing/replacing one player's save data

Imports must never blindly overwrite live data. The Manager will validate archive structure and size, prevent path traversal, reject unexpected files, create a pre-import snapshot, stop or quiesce the game server when required, apply the change atomically where practical, and retain enough metadata to recover from a failed import.

See `docs/save-management.md` for the V1 design.

## Planned image

The canonical image name is planned to be:

```text
ghcr.io/king-enmity/kings-palworld-manager
```

Release tags will follow a scheme such as:

```text
latest
1
1.0
1.0.0
```

The first release is not published yet, so `docker pull` is documentation of the intended consumer workflow rather than a working release command today.

## End-user deployment

Once a release is published:

```powershell
docker pull ghcr.io/king-enmity/kings-palworld-manager:latest
```

A sample `compose.yaml` is kept in this repository for users who prefer Docker Compose. It references the published image and does **not** build the source tree.

Expected management UI:

```text
http://127.0.0.1:8080
```

The management port binds to loopback by default because V1 has no application authentication. See `docs/deployment.md` before changing that binding.

## Ports

| Port | Protocol | Purpose | Default exposure |
|---|---|---|---|
| 8080 | TCP | King's Manager WebGUI/API | loopback only |
| 8211 | UDP | Palworld game traffic | host/public as configured |
| 27015 | UDP | Palworld query traffic | host/public as configured |
| 8212 | TCP | Palworld REST API | **never published by default** |

## Persistent data

V1 uses two persistent areas:

```text
/manager/data
/pal/Package/Pal/Saved
```

Manager state will use SQLite under `/manager/data`. Palworld world, player, and configuration data remain in the Palworld Saved directory so container replacement and image upgrades do not destroy server state.

## Development

Development is PowerShell-first on Windows and uses:

```text
D:\KingsPalworldManager
```

The repository remains modular even though the released product is one container. Source modules are separated by responsibility so future PostgreSQL, multi-node, remote-agent, authentication, and public-server editions do not require a rewrite.

Start with `docs/development.md` and `docs/architecture.md`.

## Release philosophy

A King's Manager image release will pin the Palworld runtime it was built and tested against. Updating the application or Palworld runtime should happen through a new Docker image release instead of silently mutating the container into an unknown version.

See `docs/release-model.md` for the planned CI/CD and tagging model.

## Official Palworld references

- Palworld dedicated server guide: https://docs.palworldgame.com/
- Pocketpair official server image: https://github.com/pocketpairjp/palworld-dedicated-server-docker

## Current implementation checkpoint

The existing development branch contains the first React dashboard shell, .NET API/worker experiments, Steam metadata normalization, and single-image Docker scaffolding. Those pieces are being refactored into the production V1 runtime described above.

The draft PR remains intentionally unmerged while the runtime model, persistence, save-management, and Palworld control paths are exercised end-to-end.
