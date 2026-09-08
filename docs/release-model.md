# Release Model

King's Palworld Manager is released as a versioned Docker image. The GitHub repository contains source and documentation; the image is the supported runtime artifact.

## Canonical registry

Planned primary registry:

```text
ghcr.io/king-enmity/kings-palworld-manager
```

Docker Hub may be added later as a mirrored distribution channel. GHCR remains the canonical source unless the project explicitly changes that policy.

## Versioning

Use semantic versioning for Manager releases:

```text
MAJOR.MINOR.PATCH
```

Example release:

```text
1.2.3
```

Published aliases may include:

```text
1.2.3
1.2
1
latest
```

Pre-releases should use explicit identifiers and should not update `latest` unless intentionally designated as stable.

Example:

```text
1.0.0-beta.1
```

## Build inputs

A release build must be reproducible from a tagged repository commit and should record/pin:

- Manager source commit/version
- base image digests where practical
- Palworld server runtime/image baseline
- frontend dependency lockfile
- .NET dependency lock/restore state as appropriate
- target architectures

## Intended pipeline

```text
Pull request
  -> lint
  -> unit tests
  -> frontend build/tests
  -> backend build/tests
  -> container build
  -> container smoke test
  -> vulnerability/security scanning

Version tag
  -> repeat required validation
  -> multi-stage production build
  -> image smoke/integration test
  -> publish GHCR version tag
  -> publish major/minor aliases
  -> update latest for stable releases
  -> generate GitHub Release notes
```

Publishing must not occur if required tests or security gates fail.

## Image contents

V1 packages:

- King's Manager WebGUI
- Manager API/background services
- SQLite runtime/provider
- Palworld control/runtime integration
- Palworld dedicated server runtime baseline
- required process supervision/entrypoint tooling

Persistent server/manager state must not be baked into image layers.

## Immutable-release principle

A running release should not silently replace the Manager application binaries with arbitrary newer builds. Updating the product means pulling a new Docker image and recreating the container.

This gives users a recoverable relationship between:

```text
image tag -> Manager version -> tested Palworld compatibility
```

## Palworld updates

Palworld compatibility can change independently from Manager code. Each King's Manager release should state the Palworld version/runtime it was tested against.

When Pocketpair releases a new server version:

1. build/test King's Manager against the new runtime
2. validate settings/API compatibility
3. run backup/restore and startup/shutdown smoke tests
4. publish a new King's Manager image only after validation

This favors predictable server operation over silently upgrading underneath users.

## Supported architectures

Initial architecture support should be declared only after the complete image has been exercised on that architecture. Do not advertise ARM64 merely because individual base images support it; the Palworld runtime and Manager bundle must both be validated.

## Supply-chain/security goals

Before stable V1, release automation should include:

- least-privilege GitHub Actions permissions
- GHCR publishing via GitHub-provided credentials/OIDC where applicable
- dependency caching without caching secrets
- image vulnerability scanning
- dependency update automation
- generated SBOM/provenance where practical
- no credentials baked into Docker layers
- no production secrets in build arguments

## Release channels

Recommended future channels:

- `latest`: current stable
- exact semantic-version tags: reproducible/pinnable releases
- optional `beta`/pre-release tags during testing

Production users should be encouraged to pin exact versions when change control matters.
