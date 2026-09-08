# Steam Metadata and Palworld Branding

King's Palworld Manager uses Steam application metadata for Palworld app 1623730 to personalize the WebGUI.

## Design

Steam is contacted by the Manager backend, not by the browser.

Selected artwork is validated against a Steam CDN allowlist, downloaded into Manager data storage, hashed and served back through Manager API routes.

## Cache

Cached data is stored beneath:

`<manager data>/steam/palworld`

Metadata is considered fresh for 24 hours.

If Steam is unavailable and a previous cache exists, the Manager keeps serving the cached Palworld branding and marks it stale.

If no Steam data is available, the WebGUI falls back to the normal King's Palworld Manager theme.

## API

`GET /api/v1/steam/palworld`

Returns normalized Palworld metadata and Manager-local artwork URLs.

`POST /api/v1/steam/palworld/refresh`

Forces a Steam metadata and artwork refresh.

`GET /api/v1/steam/palworld/assets/header`

`GET /api/v1/steam/palworld/assets/capsule`

`GET /api/v1/steam/palworld/assets/background`

## Security

- Steam application ID is fixed server-side to 1623730.
- Browser clients cannot supply arbitrary metadata or image URLs.
- Artwork requires HTTPS.
- Artwork hosts are allowlisted Steam CDN hosts.
- Metadata and artwork sizes are bounded.
- Cached files use fixed Manager-owned filenames.
- External filesystem paths are never returned to the browser.
