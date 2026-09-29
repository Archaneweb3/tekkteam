# 023 — Command Deck visual system

## Status
Accepted. 2026-09-27.

## Audit before code
Rendered Overview, map, Roster, Create, Detail, Tokens, Characters and Guide at
1440, 1280 and 390. Private screens used isolated browser response fixtures;
no real wallet calls or state writes. Current UI has uniform bright-blue depth,
plain token rows, broad uncomposed panels and oversized mobile navigation.
Existing map/canonical characters are retained. Behance full page returns 403;
no assets or screen layouts are copied.

## Decision / component contract
`public/art-direction.css` is the common foundation loaded after existing styles.
Canvas #080f1c, surface1 #101e32, surface2 #17365b, surface3 #24528a.
Yellow #ffda54, positive #80dfb2, negative #ff8f96, warning #f5be72.
Panel corners 12/4/12/4px, thin structural rim and 5px dark depth. Avoid nested
frames. Headings Lilita One, body Nunito Sans 15–16px, metadata 13–14px.
Primary yellow button with 4px base, secondary cobalt, ghost quiet; 2px press/lift.
Badges compact plates, utilities retain Lucide. Desktop 216px left rail; mobile
compact five-item bar. Character cards have stage + identity + data, not glows.
Use shared CSS variables, never independent palette. Three page CSS layers may
compose existing markup without changing handlers/backend. No live actions.

## Ownership
Lead: art-direction.css, shell integration, tokens markup and final QA.
Overview: art-overview.css and overview-top.js presentation only.
Trading: art-trading.css, overview-feed.js/overview-dashboard.js display markup.
Agent surfaces: art-agents.css only, notes to lead for markup changes.
Map renderer, wallet, transaction and all backend code remain unchanged.
