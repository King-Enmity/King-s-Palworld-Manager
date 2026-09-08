# V1 Architecture

## Product boundary

V1 is distributed as **one Docker image** containing King's Manager and one Palworld dedicated-server runtime. The Git repository is the source/documentation/release home; cloning the repository is a development workflow, not a requirement for consumers.

The image is intentionally monolithic at the container boundary but modular at the code boundary.

```text
+--------------------------------------------------+
| kings-palworld-manager container                 |
|                                                  |
|  Manager host                                    |
|  +-- Web UI                                      |
|  +-- HTTP API                                    |
|  +-- scheduler/background services               |
|  +-- webhook engine                              |
|  +-- wiki/content services                       |
|  +-- backup/update/save orchestration            |
|  +-- Palworld adapter                            |
|  +-- SQLite                                      |
|          |                                       |
|          +------ internal REST ----------------+ |
|                                             |    |
|  Palworld Dedicated Server <----------------+    |
+--------------------------------------------------+
```

## Why one image for V1

The target user should be able to pull one image, attach persistent storage, map the game and management ports, and start a complete Palworld server-management product. Requiring PostgreSQL, a separate proxy, frontend, API, worker, and Palworld containers would make the self-hosted product unnecessarily difficult to install and support.

The internal implementation remains modular so later editions can split components into separate services without rewriting domain logic.

## Runtime processes

A lightweight supervisor/entrypoint will own lifecycle for the processes required inside the image. The intended runtime responsibilities are:

- start the Manager host
- install/verify the packaged Palworld runtime as defined by the image build
- start Palworld with validated arguments/configuration
- forward termination signals and perform graceful shutdown
- capture health and lifecycle events
- avoid shell interpolation of user-controlled values

Process supervision is an implementation detail and must not become the configuration API. All user-facing configuration flows through validated Manager contracts.

## Management host

The Manager application owns:

- WebGUI delivery
- `/api/v1` HTTP API
- server lifecycle commands
- Palworld REST adapter
- configuration validation and revision history
- scheduler/calendar execution
- webhook delivery
- wiki/content services
- backup/restore/update orchestration
- world/player save import and export
- Steam metadata/media normalization
- event/audit history

Long-running background work should remain separated into hosted services/modules even when it runs in the same process or container.

## Persistence

V1 uses SQLite for Manager state at a path under:

```text
/manager/data
```

Example database path:

```text
/manager/data/kpm.db
```

The persistence layer must be implemented behind interfaces/repositories so a later PostgreSQL provider can be introduced for public, multi-node, or high-availability editions.

Palworld persistent data is stored separately under:

```text
/pal/Package/Pal/Saved
```

Both paths must survive container replacement and image upgrades through Docker volumes or bind mounts.

## Module boundaries

The source should grow by responsibility rather than through large shared controllers:

- `Core` - domain contracts, shared result/error types, policies
- `Palworld` - REST client, config schema, lifecycle adapter, process/runtime abstraction
- `Steam` - store metadata/media retrieval and normalization
- `Scheduling` - calendar definitions and durable execution
- `Webhooks` - destinations, rendering, delivery, retry/history
- `Wiki` - pages/content/references
- `Backups` - snapshot, restore, retention, integrity checks
- `SaveManagement` - world/player export/import, package validation, migration metadata
- `Infrastructure` - SQLite, filesystem, networking, clocks, process execution
- `Api` - validated HTTP boundary
- `Web` - React application

Future modules may be separated into assemblies or processes without changing the external API contracts.

## Save management boundary

Save import/export is a V1 product capability, not an ad-hoc filesystem upload endpoint.

The Manager should model four explicit operations:

1. export full world/server save package
2. import full world/server save package
3. export one player save
4. import/replace one player save

Each operation must produce an operation record containing at least:

- operation ID
- type
- started/completed timestamps
- source/target identifiers where applicable
- package hash
- package format/version metadata where detectable
- compatibility warnings
- pre-operation snapshot reference
- outcome/error information

### Import safety pipeline

Uploaded/imported save content must pass through a staged pipeline before touching live data:

```text
upload -> quarantine -> size/type checks -> archive inspection
       -> path normalization -> manifest/inventory -> compatibility checks
       -> pre-import snapshot -> controlled server stop/quiesce
       -> staged extraction -> validation -> atomic/safe replacement
       -> server start/health verification -> commit operation
```

On failure, the Manager should preserve diagnostic information and offer rollback to the pre-import snapshot where possible.

### Archive and filesystem validation

- enforce configurable upload/package size limits
- allow only explicitly supported package formats
- reject absolute paths
- reject `..` path traversal
- reject symlink/hardlink/device entries unless explicitly supported and proven safe
- reject extraction targets outside the staging root
- cap file count, expanded size, and compression ratio to reduce archive-bomb risk
- reject unexpected executable/script content where it is not part of an allowed save package
- never extract directly into the live Palworld Saved directory
- calculate hashes for imported/exported packages
- use staging directories on the same filesystem when atomic rename/replacement is desired

### World import behavior

A world import may affect world-level files, player files, configuration-adjacent state, and identifiers. It must therefore be treated as a server-level destructive operation with an automatic pre-import snapshot.

The implementation should detect and clearly surface version/identity conflicts rather than silently rewriting unknown structures. Any future save conversion logic must live behind explicit versioned adapters and should never mutate the user's original upload.

### Player import behavior

Player import/export must identify players using safe server-side identifiers discovered from the current save/runtime state, not arbitrary client-provided filesystem paths.

The API should accept a logical player ID and resolve it to allowed save paths internally. Replacing a player save must create a snapshot of the current player data first and should require the server to be stopped/quiesced when needed for consistency.

## Trust boundaries

1. Browser input is untrusted.
2. The management UI/API binds to `127.0.0.1:8080` by default for V1 because application authentication is deferred.
3. The Palworld REST port is internal to the container and must never be published by default.
4. Palworld game/query ports are the only intended public game-facing ports.
5. Outbound webhook destinations are untrusted and must pass SSRF protections.
6. Steam/Pocketpair responses are external data and must be parsed defensively.
7. Persistent files may be modified outside the application; reads must tolerate corruption/invalid state and report actionable errors.
8. Uploaded save packages and archives are hostile input until fully validated.
9. Secrets must never be written to logs or committed to the repository.

## Validation rules

- Reject unknown configuration properties rather than silently ignoring them.
- Use explicit schemas/allow-lists for Palworld setting names.
- Validate enum/range/string constraints before mutating files or calling Palworld.
- Generate Palworld configuration from structured values; do not patch configuration with arbitrary user text.
- Never interpolate untrusted values into shell command strings.
- Prefer direct process argument arrays.
- Normalize and validate webhook URLs before delivery.
- Block loopback, link-local, private-network, multicast, and metadata-service webhook targets unless a future explicit policy allows them.
- Resolve DNS carefully and defend against DNS rebinding for outbound requests.
- Cap request, wiki page, webhook body, upload, log, and response sizes.
- Persist scheduled jobs before acknowledging creation.
- Make destructive actions explicit and auditable.
- Use idempotency/operation IDs where retries could duplicate external effects.
- Write configuration atomically: create validated temporary output, fsync where practical, then replace.
- Keep a last-known-good configuration revision before applying changes.
- Quarantine uploads before inspection and never trust archive entry paths.

## Palworld control path

The WebGUI must not call Palworld directly.

```text
Browser -> Manager API -> validation/policy -> Palworld adapter -> REST/process/config
```

This keeps credentials, REST details, file paths, and process control out of the browser and provides one place for audit, retries, safety checks, and compatibility handling.

## Update model

A released Docker image represents a tested combination of King's Manager code and a Palworld runtime baseline. Consumers update by pulling a newer King's Manager image and recreating the container while retaining persistent volumes.

V1 should avoid silently self-updating the application container. The WebGUI may detect/display available versions and guide an update, but the deployed image remains an immutable release artifact.

## Security progression

### V1 self-hosted

- loopback-only management binding by default
- strict validation
- internal Palworld REST access
- secret redaction
- SSRF protections
- safe process invocation
- atomic config writes
- audit/event history
- backup integrity checks
- save upload quarantine and archive traversal protections
- automatic pre-import snapshots
- conservative Docker capabilities/permissions

### Later public edition

- authentication
- RBAC/permissions
- CSRF/session controls where applicable
- rate limiting
- trusted proxy/TLS configuration
- account protection/2FA options
- PostgreSQL
- remote server agents
- multiple Palworld nodes
- hardened multi-user audit controls

## Development data

During the deployment/refactor phase, temporary development state can be discarded. Database migrations and upgrade paths should still be exercised from the beginning so public releases are not the first time upgrade behavior is tested.
