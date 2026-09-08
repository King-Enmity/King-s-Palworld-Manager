# Palworld Live State and Player Administration

King's Palworld Manager exposes a cohesive live server snapshot for the WebGUI.

## Live state

`GET /api/v1/palworld/live`

The response combines:

- Manager-owned process runtime state
- Palworld REST availability
- Server information
- Connected players
- Server metrics
- Derived player count, max players, FPS, frame time, uptime, world days and base-camp count

Health values:

- `offline`
- `transitioning`
- `online`
- `degraded`
- `crashed`

When the owned Palworld process is not running, the live endpoint does not probe the REST listener. This avoids unnecessary REST timeouts while the server is stopped.

When the process is running but one REST data source fails, the endpoint returns a degraded snapshot instead of failing the entire dashboard.

## Player actions

Manager endpoints:

- `POST /api/v1/palworld/players/{userId}/kick`
- `POST /api/v1/palworld/players/{userId}/ban`
- `POST /api/v1/palworld/players/{userId}/unban`

Kick and ban accept an optional JSON body containing a `message` field.

The Manager converts the route `userId` to Palworld's upstream `userid` field.

Player action messages are limited to 512 characters.

The message itself is not written to audit metadata. Only its length is recorded.

## Audit

Kick, ban and unban operations are persisted as audit events using the Palworld user ID as the entity identifier.

The Manager does not expose the Palworld REST listener to the browser.
