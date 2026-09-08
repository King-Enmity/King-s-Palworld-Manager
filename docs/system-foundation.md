# System Foundation

The V1 Manager backend owns its application state independently from
Palworld.

## Persistent state

SQLite is stored under `KPM_DATA_PATH`.

The initial schema contains:

- `schema_migrations`
- `system_settings`
- `audit_events`

Schema changes are applied through ordered application migrations.

## Health endpoints

### GET /health

Process liveness.

This endpoint does not require Palworld to be running.

### GET /ready

Manager readiness.

The initial readiness test verifies that SQLite is available.

### GET /api/v1/system

Returns live Manager state including:

- Manager version and edition
- Manager uptime
- persistence status
- Palworld runtime state
- Palworld configured ports
- audit event count

## Palworld runtime state

The initial runtime state is `unknown`.

Future lifecycle work will transition through:

- stopped
- starting
- running
- stopping
- crashed

The Manager does not assume Palworld is running merely because the
Manager process is healthy.