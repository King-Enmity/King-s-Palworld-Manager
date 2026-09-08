# V1 Save Management

## Scope

V1 supports portable save operations through the WebGUI and API:

- export a full world/server save package
- import a full world/server save package
- export an individual player save
- import/replace an individual player save

These are separate from routine scheduled backups, although they share snapshot, integrity, and restore infrastructure.

## Goals

- make moving a server between hosts simple
- allow safe player-data transfer/replacement workflows
- never require users to manually browse container filesystem paths
- preserve originals and create recovery points before destructive imports
- provide clear compatibility warnings rather than silently mutating unknown save formats

## Export design

Exports are generated from server-controlled known paths. The client never supplies an arbitrary source path.

An export package should contain a manifest with:

- King's Manager package schema version
- export type (`world` or `player`)
- creation timestamp
- detected Palworld/server version when available
- logical world/player identifier
- file inventory
- SHA-256 hashes
- warnings/notes

The package should not contain Manager secrets, webhook credentials, or unrelated container files.

## World export

A world export represents the portable Palworld save state required to move or restore the hosted world. Exact file membership will be determined from the supported Palworld runtime layout and version adapters.

For a consistency-sensitive export, the Manager may request/save current state and briefly quiesce or stop Palworld before packaging.

## Player export

Player exports operate on logical player identifiers discovered by the Manager. The client cannot request arbitrary filenames.

Where player state has dependencies outside a single file, the supported version adapter must include or warn about those dependencies rather than pretending a single file is always sufficient.

## Import design

Imports are uploaded into a quarantine/staging area under Manager-controlled storage. Nothing is extracted directly into live Palworld paths.

Minimum pipeline:

1. accept upload under configured byte limit
2. hash original upload
3. verify allowed archive/container format
4. enumerate entries without extraction
5. reject absolute/traversal paths and unsafe link/device entries
6. enforce file-count, expanded-size, and compression-ratio limits
7. compare manifest/inventory with the selected operation type
8. detect supported/unknown Palworld compatibility metadata
9. create automatic pre-import snapshot
10. stop/quiesce Palworld when required
11. extract to isolated staging directory
12. validate staged result
13. replace approved live paths safely/atomically where practical
14. restart/health-check Palworld
15. record success or expose rollback

## Security requirements

Treat every imported archive as hostile.

Required controls:

- no arbitrary destination paths
- canonicalize every path before filesystem operations
- reject zip-slip/tar traversal patterns
- reject symlink/hardlink tricks unless a future package format explicitly supports them safely
- cap upload size
- cap extracted size
- cap entry count
- cap nesting depth where relevant
- cap compression ratio
- reject unsupported file types/locations
- never execute imported content
- isolate temporary extraction
- clean staging after operation according to retention policy
- redact secrets and local absolute paths from user-facing error details where appropriate

## Destructive-operation policy

World import and player replacement are destructive operations.

Before applying either:

- create a pre-import snapshot
- record an operation ID
- expose what will be replaced
- require explicit confirmation in the WebGUI
- prevent concurrent backup/import/update/config-write operations that could corrupt state

## Rollback

If validation, replacement, restart, or post-start health checks fail, the Manager should retain the pre-import snapshot and offer a rollback operation.

Automatic rollback may be added when the failure mode is unambiguous, but preserving recoverability is more important than hiding failures.

## Compatibility/version adapters

Palworld save layouts can change. Save handling therefore belongs behind versioned adapters rather than hard-coded UI assumptions.

An adapter is responsible for:

- discovering current world/player save paths
- determining required file sets
- identifying supported package layouts
- surfacing compatibility warnings
- mapping logical player IDs to safe server-side paths

Unknown layouts should fail safely with an actionable message instead of being force-imported.

## API direction

Planned API families:

```text
GET  /api/v1/saves/world/export
POST /api/v1/saves/world/import
GET  /api/v1/saves/players
GET  /api/v1/saves/players/{playerId}/export
POST /api/v1/saves/players/{playerId}/import
GET  /api/v1/saves/operations/{operationId}
POST /api/v1/saves/operations/{operationId}/rollback
```

Exact routes may change during implementation, but the API must use logical identifiers and operation records rather than arbitrary filesystem paths.
