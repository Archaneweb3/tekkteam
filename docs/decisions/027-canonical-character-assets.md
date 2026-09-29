# 027 — Canonical character assets

Date: 2026-09-27
Status: Accepted

## Context

The office used independent character specifications while Agent Detail and portraits used `SKIN_MODELS`. The same visual role could therefore look unrelated between surfaces. Rendering every list portrait in a temporary WebGL context also repeated work unnecessarily.

## Decision

`character-registry.js` resolves the existing five character IDs, with legacy `diamond` compatibility and a consistent `frank` fallback. `createCanonicalCharacter()` in `skins3d.js` is the model factory for both office and Detail. It preserves the existing geometry and colors; no model was regenerated. Office role-to-character assignment is explicit, with existing four placements, camera and interaction targets unchanged.

`hydrateCharacters()` uses transparent 512×512 WebP portraits generated from the same `createBoss()` renderer. Consequently roster, Employee of the Month, Trading Desk and Payroll reuse canonical assets without another renderer per row. This is an asset plumbing change, not a redesign of those surfaces.

## Consequences

- Regenerate committed portraits after changing canonical model geometry: start the development server, then run `node scripts/render-character-portraits.mjs`. Set `PORTRAIT_ORIGIN` only when the local server origin differs.
- Run `node --test tests/canonical-characters.test.mjs` to compare model vertices, indices and poses and verify image dimensions and alpha.
- The office/skins module dependency is deferred: do not call the factory during module initialization.
- The existing `characterTokenImage()` PNG publication workflow is unchanged. Token images remain a separate concept from agent identity.
- Dynamic scene animation differs by context, but geometry and identity do not. Static portraits deliberately retain the Detail plinth and use a consistent square camera.
- No AI-generated replacement characters, new office placements, lower-page layouts, or product data changes are introduced.
