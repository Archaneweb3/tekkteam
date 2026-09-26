# ADR-009: Refresh the public frontend and introduce TEKKWORK voxel identity

## Status

Accepted

## Date

2026-09-26

## Context

The user requested a fresh copy of their BAGWORK public frontend, renamed TEKKWORK, with new voxel characters and a different office map while retaining the remaining page layouts and interactions. The previous glass/map-led homepage no longer represents this direction. The current port 5173 serves another workshop prototype, so this checkout is previewed at port 5188.

## Decision

Recover publicly referenced HTML, CSS, JavaScript, and images with `scripts/sync-reference.mjs`. Keep the original resource archive and hashes in `.reference/bagwork`, excluded from Git and deployment. Forty same-origin resources were recovered without errors. The archive contains client source only; the server source is unavailable.

Restore the reference page composition and current interface modules. Apply TEKKWORK branding and a blue palette. Share a new square-headed digital-face voxel rig across the office, boss, and six skins; generate seeded matching avatars for lists and the launch picker. Render replacement raster assets for the sidebar, fallback, skins, icons, and sharing image.

Build a single-floor office with a segmented back wall, three rectangular workstations, a meeting table, low partition, and central walking aisle. Keep labeled actions and projected character hit tests. The walking path stays clear of desks and partitions.

Keep the existing local snapshot and read-only API/wallet adapters. Refresh public strategy and skin configuration into a local preview config. The frontend displays its preview state and does not send requests to the reference transaction API. Launch, funding, signing, withdrawal, and purchases need a separately supplied backend before becoming live.

This supersedes ADR-006 through ADR-008 for homepage composition and scene styling. The frontend-only boundary in ADR-004 remains.

## Alternatives considered

- Preserve the floating navigation and map-led redesign: rejected because the user now wants the reference's other features and layout retained.
- Point the rebranded frontend at the reference write API: not part of the public-source recovery and would not constitute an independent TEKKWORK backend.

## Consequences

Verify every route, responsive navigation, launch character selection, filters, action bubbles, skins, brand names, asset loading, and no-WebGL fallback. Source archive refresh is read-only by default; `--apply` replaces interface modules and must only be used when intentionally resetting to a new reference baseline.
