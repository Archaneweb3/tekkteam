# ADR-011: Character-led game interface

## Status

Accepted. Replaces ADR-010's restrained visual direction, not its backend boundaries.

## Date

2026-09-26

## Context

The user approved adapting the hierarchy, typography, buttons and feature presentation of Gonzalo Vazquez's Brawl Stars UI/UX 2025 showcase across TEKKWORK.

## Decision

Use cobalt blue solid panels, navy outlines, short press shadows, yellow primary actions, cyan selection states and Lilita One display typography with Nunito Sans body text. These are accessible Google Fonts alternatives, not claimed proprietary Brawl Stars fonts. Preserve original voxel characters and office geometry.

Adapt the lobby, roster, character collection and setup/loadout patterns to real TEKKWORK features. Character setup is character-first with in-page section navigation; identity and strategy remain editable without hiding required fields. Preserve keyboard selection, wallet-draft restoration and canvas containment.

## Consequences

The additive game-ui stylesheet applies consistently across active routes. No borrowed characters/logos or invented rewards, trading activity, paid collectibles or artificial scarcity. Existing mainnet/trading restrictions remain. Browser regression checks cover all routes, authenticated drafting and character bounds.
