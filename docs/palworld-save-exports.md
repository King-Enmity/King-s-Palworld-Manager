# Palworld Save Exports

King's Palworld Manager exports canonical world and player save archives.

## Endpoints

- `GET /api/v1/saves/worlds/{slotId}/{worldId}/export`
- `GET /api/v1/saves/worlds/{slotId}/{worldId}/players/{playerId}/export`

Exports use `.tar.gz` archives.

## Consistency rule

The managed Palworld process must be stopped before an export is created.

This prevents a normal export from silently packaging files while Palworld is actively mutating them.

A future orchestration operation can perform save, stop, export and restart as one higher-level workflow.

## Archive layout

- `manifest.json`
- `data/...`

World exports preserve the live world layout underneath `data/`.

Player exports preserve the player file at `data/Players/{playerId}.sav`.

Palworld's top-level `backup` directory is excluded from normal world exports.

## Manifest

The version 1 manifest contains:

- format identifier
- schema version
- export kind
- creation timestamp
- Manager version
- source save slot
- source world ID
- source player ID when applicable
- relative file inventory
- byte size for every file
- source modification timestamp
- SHA-256 for every file
- total file count
- total uncompressed bytes

The Palworld version field is currently nullable until version discovery is connected to save management.

## Safety

- Browser clients never provide filesystem paths.
- Server-selected identifiers are resolved through the save inventory.
- Symbolic links are rejected.
- Non-regular files are rejected.
- Relative paths are containment-checked.
- Files are copied into Manager staging outside the live Palworld tree.
- Each source file is checked again after copying.
- World membership is checked again after copying.
- Temporary staging is deleted after the download stream closes.

The complete archive SHA-256 is returned in the `X-KPM-Archive-SHA256` response header.
