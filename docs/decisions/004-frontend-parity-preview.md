# ADR-004: Adapt the owned frontend as a read-only TEKKTEAM preview

## Status

Accepted

## Date

2026-09-26

## Context

The existing TEKKTEAM prototype did not match the user-owned BAGWORK website across the homepage, subpages, content, and 3D scenes. The user requested closer 1:1 frontend parity and chose "frontend only" when asked about the missing backend/API source.

## Decision

Use the browser-delivered BAGWORK frontend modules and assets as the visual/interaction baseline. Keep its route and DOM structure, WebGL office/phone/boss/skins, and responsive CSS. Apply TEKKTEAM branding and a blue palette in a separate override. Use saved public snapshot data and locally recovered media for the visible content. Replace the API and wallet modules with read-only adapters so this separately branded site cannot sign or submit real Solana transactions.

## Alternatives considered

- Continue reconstructing the site with independent Three.js components: rejected because repeated layout, content, and route differences prevented parity.
- Proxy the production BAGWORK API: rejected because it would conflate the two sites and could expose real wallet/transaction flows without an authorized backend integration.

## Consequences

- Layout and 3D behavior can track the owner-provided reference closely while branding remains distinct.
- Market figures and agent details are historical snapshots, not live data. This is explicitly labeled in the UI.
- Launch, wallet, skin purchase, and other writes are unavailable until the authorized backend and product rules are supplied.
- Public IPFS gateways rate-limited some image retrievals; those images fall back to the source UI's built-in placeholder.
