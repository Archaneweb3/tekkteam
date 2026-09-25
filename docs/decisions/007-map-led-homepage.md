# ADR-007: Keep the 3D workspace as a full-width homepage stage

## Status

Accepted

## Date

2026-09-26

## Context

The user approved the 3D “The Digital Workspace” map but found its split hero and surrounding sections too similar to the original reference. The first glass-studio layout in ADR-006 placed editorial copy beside the map and overlaid the phone on the map.

## Decision

Keep the existing interactive office WebGL scene and its action hotspots unchanged. Put a compact editorial introduction above a full-width map stage, with a small orientation rail inside the stage. Move the phone to a separate “Signals” section below the map. Preserve the WebGL host IDs and navigation actions so the layout can change without rewriting scene controllers.

This supersedes ADR-006 only for the homepage composition. Its shared floating navigation, glass design system, and frontend-only boundary still apply.

## Alternatives considered

- Keep the two-column split and make the map larger: rejected because the same copy/map/phone relationship would remain.
- Remove the map and replace it with a static hero: rejected because the user explicitly wants the interactive workspace preserved.

## Consequences

The map spans the content width on desktop and remains a standalone stage on mobile. The phone is still interactive, but no longer obscures the map. Browser checks must cover initial viewport visibility, full map, phone section, hotspot navigation, and mobile overflow.
