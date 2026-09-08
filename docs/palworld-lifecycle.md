# Palworld Process Lifecycle

King's Palworld Manager owns the Palworld Dedicated Server process in
the V1 single-container deployment.

## Runtime states

- `unknown`
- `stopped`
- `starting`
- `running`
- `stopping`
- `crashed`

The Manager records the owned process PID, timestamps, exit code,
termination signal, and the most recent runtime error.

## Launch

The production Linux launch plan uses:

`PalServer.sh -port=<configured game port>`

Arguments are passed directly to the child process without shell
interpolation.

The Manager does not automatically add legacy multithread optimization
flags.

## API

- `GET /api/v1/palworld/runtime`
- `POST /api/v1/palworld/start`
- `POST /api/v1/palworld/stop`
- `POST /api/v1/palworld/restart`

Duplicate starts are rejected with HTTP 409.

## Stop behavior

The Manager first sends a graceful termination signal and waits for
`KPM_PALWORLD_STOP_TIMEOUT_MS`.

The default timeout is 30000 milliseconds.

If Palworld remains alive after the timeout, the Manager performs a
forced termination and records a warning audit event.

## Crash detection

An exit that occurs without a Manager-requested stop transitions the
runtime to `crashed`.

Exit code or exit signal information is retained in the runtime
snapshot.

## Manager shutdown

When the Manager itself receives SIGINT or SIGTERM, it first attempts
to stop its owned Palworld process before closing the HTTP server and
SQLite database.

REST-assisted save/shutdown will be added in the REST integration
layer. Process ownership does not depend on REST being available.

## REST-assisted graceful shutdown

Normal Manager stop and restart operations use this sequence:

1. Request a world save through Palworld REST.
2. Request the official REST shutdown endpoint.
3. Wait for the owned Palworld process to exit.
4. Fall back to SIGTERM if REST is unavailable or does not stop the process.
5. Use SIGKILL only after the normal process stop timeout is exceeded.

REST save or shutdown failures do not prevent an administrator from
stopping the server. They are recorded as audit warnings before the
process fallback is used.
