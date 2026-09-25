# ADR-008: Replace the enclosed office with an open island workspace

## Status

Accepted

## Date

2026-09-26

## Context

The full-width interactive map from ADR-007 was still too close to the reference: the two-wall room, windows, desks, and floating action bubbles retained its recognizable composition. The user wants to keep the 3D workspace hero, but make the scene itself visibly original.

## Decision

Build an open-plan studio of four work islands: Launch, Shill, Trade, and a central Guide hub. Each island has its own elevation, color, silhouette, and job-specific equipment. A continuous tiled floor, small worktables, and chairs establish an office setting without restoring the reference's enclosing walls, windows, repeated desk rows, rug, or signage. Place each character on its corresponding island and confine the walking Guide to the central hub.

Anchor HTML action bubbles to stable points on the islands, while retaining separate character-space coordinates for canvas hit testing. Use icon-led buttons with recognizable action names instead of numeric zone tags. Keep the existing role-to-action mapping, WebGL host, and frontend-only product behavior. Regenerate the no-WebGL fallback from the new scene without baking interactive labels into its image.

## Alternatives considered

- Recolor or rearrange the original room: rejected because its wall-and-desk silhouette would remain recognizable.
- Replace the interactive map with a flat illustration: rejected because the user wants the 3D workspace hero preserved.

## Consequences

The map now reads as a modular office studio rather than an office copy or floating game level. Camera framing and action-button placement need separate desktop and mobile checks. Any future character or equipment changes should update island coordinates, canvas hit targets, HTML buttons, and the static fallback together.
