# Palworld Discovery

The Manager treats the Palworld installation as an external runtime
owned through a dedicated adapter.

## Default container layout

The expected V1 Linux container root is:

`/pal/Package`

Important paths beneath that root:

- `PalServer.sh`
- `DefaultPalWorldSettings.ini`
- `Pal/Saved`
- `Pal/Saved/Config/LinuxServer/PalWorldSettings.ini`
- `Pal/Saved/SaveGames`
- `Pal/Saved/Logs`

The root remains configurable through `KPM_PALWORLD_ROOT`.

## Discovery endpoint

`GET /api/v1/palworld/discovery`

The endpoint reports which expected paths currently exist.

It also safely reads `PalWorldSettings.ini` when present.

## Secret handling

The settings preview never returns password values.

Sensitive setting names may be reported as present, but their values
must never be exposed by the discovery API or written to application
logs.

## Forward compatibility

Unknown Palworld settings are accepted by the parser.

The Manager must not rewrite a configuration file until the settings
editor supports lossless preservation of settings it does not
understand.