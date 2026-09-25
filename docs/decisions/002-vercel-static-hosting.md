# ADR-002: Host the prototype as a static Vite build on Vercel

## Status

Accepted

## Date

2026-09-25

## Context

TEKKTEAM is a browser-only Three.js prototype. It has no server API, wallet, or market-data connection. The user requested a GitHub release and Vercel deployment.

## Decision

Publish the source in the `Archaneweb3/tekkteam` GitHub repository and deploy the Vite `dist/` output to a new `tekkteam` Vercel project. Hash-based routes require no server rewrite. Keep diagnostic screenshots, dependency folders, and local Vercel settings out of Git.

## Alternatives considered

- **A server-rendered deployment:** unnecessary for a client-side prototype and would add runtime complexity.
- **Committing built files:** duplicates generated output and increases repository noise; Vercel can build from source.

## Consequences

- Releases can be reproduced from `npm ci` and `npm run build`.
- The public site is a visual prototype; live financial features remain unavailable until deliberately implemented and reviewed.
