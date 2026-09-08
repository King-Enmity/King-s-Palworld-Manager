# Palworld Save Import Preview

King's Palworld Manager validates save imports before any live save data can be changed.

## Endpoint

`POST /api/v1/saves/import/preview`

The request uses `multipart/form-data` with exactly one file field named `archive`.

This endpoint does not modify the live Palworld save tree.

## Quarantine

Uploads are streamed directly to Manager quarantine storage rather than accumulated in memory.

A successful preview receives an operation ID and remains quarantined for up to 24 hours for a later confirmation/apply workflow.

Expired operation directories are removed when the import subsystem starts and when a new upload begins.

## Limits

- Maximum compressed archive size: 1 GiB
- Maximum expanded archive size: 8 GiB
- Maximum manifest size: 4 MiB
- Maximum data files: 100,000
- Maximum archive depth: 64 path components
- Maximum decompression ratio: 100:1

## Archive validation

Before extraction, the Manager:

- requires gzip format
- traverses the tar headers in strict mode
- rejects absolute paths
- rejects drive-letter paths
- rejects backslashes
- rejects empty, dot and dot-dot path components
- rejects symbolic links
- rejects hard links
- rejects device and FIFO entries
- rejects unsupported archive entry types
- rejects duplicate paths
- rejects case-insensitive path collisions
- enforces file-count, size and depth limits
- requires the canonical `manifest.json` plus `data/` layout
- rejects top-level Palworld `backup` content

Extraction occurs only after the archive header inspection succeeds.

Extraction also uses tar strict mode, path hardening, owner preservation disabled, chmod disabled, depth limits and decompression-ratio limits.

## Manifest and data verification

After extraction, the Manager verifies:

- manifest format and schema version
- source slot, world and optional player identifiers
- manifest file count
- manifest byte total
- exact archive-to-manifest file membership
- exact per-file sizes
- SHA-256 of every extracted save file
- canonical player export layout
- recognizable world-save layout

The preview response reports source identity, archive SHA-256, file counts, expanded size, validation state and compatibility warnings.

## No destructive action

Import preview never replaces live save files. Live replacement, pre-import snapshots, rollback and restart verification are separate later stages.
