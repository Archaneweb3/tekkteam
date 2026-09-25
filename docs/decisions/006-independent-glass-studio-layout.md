# ADR-006: Establish an independent glass-studio layout

## Status

Accepted

## Date

2026-09-26

## Context

After the frontend recovery and toy-brick asset redesign, the site's layout still resembled its BAGWORK reference: a fixed left rail, 3D scene and phone at the top, then the main message below. The user explicitly requested a different layout and an Apple-inspired liquid-glass appearance so TEKKTEAM reads as its own website.

## Decision

Replace the desktop rail with a floating horizontal navigation and place an editorial introduction beside the 3D workspace. Treat the phone as a floating object inside the workspace showcase, and present metrics and subpage content in translucent, blue-tinted glass panels. Keep semantic routes, scene hosts, existing controls, and responsive access to every navigation item. Label all routes as a concept studio using saved demo data.

This supersedes the visual-parity part of ADR-004; its frontend-only data and transaction boundary remains in force. ADR-005's original toy-brick geometry remains unchanged.

## Alternatives considered

- Recolor the old sidebar and cards with blur only: rejected because the visual hierarchy and spatial layout would still look like the reference.
- Rebuild every route from scratch: rejected because it would unnecessarily risk the working WebGL interactions and read-only demo flows.

## Consequences

`public/tekkteam.css` is the design layer for shared glass surfaces and responsive composition. The homepage has new semantic studio containers while retaining existing DOM IDs used by the 3D controllers. Visual QA must cover desktop and mobile: blur, overflow, navigation, and scene sizing are not validated by the build alone.
