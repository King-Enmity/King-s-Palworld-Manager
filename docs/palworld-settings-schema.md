# Palworld Settings Schema

King's Palworld Manager builds its effective settings schema from the
Palworld Dedicated Server files installed in the container.

## Sources

The Manager compares:

- `DefaultPalWorldSettings.ini`
- the live `PalWorldSettings.ini`

The installed default file is treated as the authoritative source for
which settings are known to that installed Palworld version.

## API

`GET /api/v1/palworld/settings`

The endpoint is read-only.

For each setting it reports:

- inferred type
- whether it exists in installed defaults
- whether a live value exists
- default value
- current value
- whether the setting differs from default
- validation results
- whether the setting is sensitive

## Unknown settings

Settings found only in the live configuration are preserved and
reported as `live-only`.

Unknown settings are not considered invalid solely because the Manager
does not recognize them.

This is required for forward compatibility with new Palworld versions,
mods, experimental settings, and settings added before the Manager has
been updated.

## Secrets

The API never returns values for:

- `AdminPassword`
- `ServerPassword`

The API may report whether a sensitive setting is configured.

## Validation

The primary validation source is the type inferred from the installed
default configuration.

Additional hard limits are added only where sufficiently authoritative
rules exist.

Initial explicit validation includes:

- TCP/UDP port syntax: 1 through 65535
- `BaseCampMaxNumInGuild`: maximum 10
- `BaseCampWorkerMaxNum`: maximum 50
- `ServerReplicatePawnCullDistance`: 5000 through 15000

The Manager must not invent gameplay limits where Palworld does not
document one.

## Writes

This layer does not modify configuration files.

Lossless and atomic configuration writing is a separate feature that
will be built only after read/validation behavior is stable.