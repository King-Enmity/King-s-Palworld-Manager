# Palworld Settings Writer

Configuration changes use a two-step workflow.

## Preview

`POST /api/v1/palworld/settings/preview`

The Manager:

1. loads installed defaults and live settings
2. validates requested values
3. rejects writes to settings absent from installed defaults
4. redacts secret values
5. computes the exact proposed configuration
6. returns the SHA-256 hash of the current configuration

No file is modified.

## Apply

`POST /api/v1/palworld/settings/apply`

Apply requires the SHA-256 returned by preview.

If the live file changed between preview and apply, the Manager rejects
the request with HTTP 409.

Before replacement the Manager creates a snapshot under its persistent
data directory.

The replacement file is written and flushed to a temporary file in the
same directory before rename.

The resulting file is read back and verified by SHA-256.

## Preservation

Only requested value spans inside `OptionSettings=(...)` are replaced.

Untouched settings, unknown settings, comments, other sections, ordering,
and unrelated file content remain unchanged.

Known settings missing from the live file may be appended.

## Secrets

Password values are accepted for writes but never returned by preview
or apply responses and are never placed in audit metadata.

## Restart policy

King's Palworld Manager treats committed PalWorldSettings.ini changes as
restart-required.

The writer does not restart Palworld automatically. Lifecycle
orchestration will handle that separately.