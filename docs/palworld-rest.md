# Palworld REST Integration

King's Palworld Manager proxies the Palworld REST API through the
Manager backend.

The browser never connects directly to Palworld REST.

## Network boundary

The Palworld REST host is fixed internally to:

`127.0.0.1`

The effective port is read from the live `RESTAPIPort` setting when
valid. `KPM_PALWORLD_REST_PORT` is used as the fallback.

The upstream API base path is:

`/v1/api`

## Authentication

Palworld REST uses HTTP Basic Auth.

The password is read privately from the live `AdminPassword` setting
for each operation. It is never returned through the Manager API.

The Basic Auth username is configured with:

`KPM_PALWORLD_REST_USERNAME`

## Manager API

- `GET /api/v1/palworld/rest/status`
- `GET /api/v1/palworld/info`
- `GET /api/v1/palworld/players`
- `GET /api/v1/palworld/metrics`
- `GET /api/v1/palworld/rest/settings`
- `POST /api/v1/palworld/announce`
- `POST /api/v1/palworld/save`

## Security

Palworld REST remains loopback-only from the Manager's perspective.

Manager API clients cannot supply an arbitrary REST host.

REST credentials are never returned.

Sensitive REST settings such as `AdminPassword` and `ServerPassword`
are removed from Manager responses.

Requests use a configurable timeout and upstream errors are normalized
before being returned to Manager clients.

## Future lifecycle integration

The save endpoint will next be integrated with lifecycle shutdown so a
normal Manager stop can request a world save before graceful server
termination.