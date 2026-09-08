# V1 Architecture

## Goals

V1 is the self-hosted edition. It intentionally omits application login/authentication, so the management surface is loopback-bound by default and must not be published directly to the Internet.

## Services

- `gateway`: Caddy reverse proxy. The only management service with a host TCP binding.
- `web`: React/Vite frontend served by non-root nginx.
- `api`: .NET 10 control-plane API. Owns validation, Steam metadata normalization, and future Palworld adapters.
- `worker`: .NET 10 background worker for durable schedules, webhooks, backups, update checks, and maintenance jobs.
- `db`: PostgreSQL for durable configuration history, scheduler jobs, webhook definitions, wiki content metadata, and audit/event records.
- `palworld`: Pocketpair's official Palworld dedicated-server image.

## Trust boundaries

1. Browser traffic enters through `gateway` only.
2. `db` is on an internal network and has no host-published port.
3. Palworld management traffic is isolated on `palworld-private`.
4. The Palworld REST API must never be published as a host port. The API/worker will call it only over the private Docker network.
5. Secrets are local environment values for V1 and must never be committed.
6. Containers that do not require writes use read-only roots, dropped Linux capabilities, and `no-new-privileges`.

## Module boundaries

The codebase will grow by module rather than by large shared controllers:

- Server lifecycle and health
- Palworld REST adapter
- Server settings schema + validation
- Configuration revisions and scheduled changes
- Calendar/scheduler
- Webhook destinations and delivery history
- Wiki/content system
- Steam metadata/media
- Backup/restore/update orchestration
- Audit/event stream

Each module should expose contracts through the API layer and keep infrastructure concerns behind interfaces so database, queue, or runtime implementations can be replaced later.

## Validation rules

- Treat all browser input as untrusted.
- Validate request models at the API boundary.
- Use allow-lists for Palworld setting names and enum values.
- Reject unknown configuration properties rather than silently ignoring them.
- Normalize and validate URLs before webhook delivery.
- Block loopback, link-local, private, and metadata-service destinations for user-defined outbound webhooks unless explicitly allowed by a future policy layer.
- Cap payload sizes and message lengths.
- Never interpolate untrusted values into shell commands.
- Persist scheduled jobs before acknowledging creation.
- Use idempotency keys for destructive or externally visible operations where practical.

## Data strategy

Temporary development data may be destroyed while V1 is under construction. Schema migrations should still be used from the start so upgrade behavior is exercised before public releases.

## Planned security progression

V1: local/self-hosted boundary, validation, secret hygiene, network isolation, SSRF protections, audit trail.

Later public edition: authentication, authorization/RBAC, CSRF/session protections as applicable, rate limiting, trusted-proxy configuration, TLS deployment guidance, account lockout/2FA options, and hardened multi-user audit controls.
