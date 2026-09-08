# Palworld Save Inventory

The save-management subsystem begins with a read-only inventory of server-selected save data.

## API

- `GET /api/v1/saves`
- `GET /api/v1/saves/worlds`
- `GET /api/v1/saves/worlds/{slotId}/{worldId}`
- `GET /api/v1/saves/worlds/{slotId}/{worldId}/players`

The browser never provides filesystem paths.

Worlds are discovered underneath the configured Palworld `SaveGames` directory.

A candidate world must contain `Level.sav`, `LevelMeta.sav`, or a `Players` directory.

World and player identifiers are derived from server-side directory and file names and validated before use.

## Safety

- Symbolic links are not followed.
- Non-regular filesystem entries mark a world unsafe.
- Scans are bounded to 500,000 live files per world.
- Invalid player save filenames mark a world unsafe.
- Absolute filesystem paths are not returned by the API.

## Built-in Palworld backups

A top-level `backup` directory inside a world is detected but excluded from the live-world size and file inventory.

This prevents Palworld rolling backups from being accidentally bundled into a future normal world export.

## Next stage

World and player export archives will use these server-selected identifiers and will include versioned manifests and SHA-256 file hashes.
