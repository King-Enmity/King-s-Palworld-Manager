# V1 Architecture

King's Palworld Manager V1 is distributed as one Docker image.

The source is modular even though deployment is a single container.

## Runtime

- React WebGUI
- Fastify API
- TypeScript background services
- SQLite manager persistence
- Palworld Dedicated Server
- Palworld internal REST API

## Modules

- Palworld
- Saves
- Backups
- Scheduling
- Webhooks
- Wiki
- Steam
- Infrastructure
- Database

## Security

- Browser input is always untrusted.
- Palworld REST port 8212 is never published by default.
- Configuration values are schema validated.
- Shell command interpolation is prohibited.
- Save imports are staged and validated before touching live data.
- Webhook destinations are validated against SSRF risks.
- Secrets are never logged.
