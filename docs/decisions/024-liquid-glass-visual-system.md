# 024 — Restrained glass material system

## Status
Accepted. 2026-09-27. Supersedes the material and mobile navigation portions of 023.

## Audit before code
The current application was rendered at 1440, 1280 and 390 before edits.
The local Command Deck already replaced the earlier saturated-blue release.
Remaining issues: heavy sidebar and selected states, boxed map with header/footer
strips, hard podium blocks, tall payroll cards, oversized borders and uppercase
labels. Found overlapping material rules in game-ui.css, polish.css, overview
component sheets and art-*.css. Deleting those whole sheets would also remove
unrelated layout contracts, so this scoped pass leaves geometry in place.

## Decision / component contract
glass-system.css owns the palette, spacing-independent materials, radii, shadows
and control states. Legacy token names alias the central palette. glass-shell,
glass-hero and glass-overview consume these tokens; no independent page palettes.
Glass is reserved for the floating sidebar/controls and three Overview panels.
Reading/forms surfaces are opaque. Fallbacks keep readable fills without blur.
No backdrop blur across the entire viewport. No new raster assets or icon family.
The existing alpha WebGL map blends directly into the hero background. Its
renderer, scene, projection and behavior remain unchanged. Lower Overview
portraits retain the existing canonical cached PNG renderer pipeline.

The existing nav and wallet nodes remain single canonical instances. On mobile
they appear in an accessible drawer; no duplicate wallet/session state. Hero
Hire Agent links to the existing creation route; View Activity uses the existing
activity scroll callback. No transactions or API mutations are introduced.

## Implementation / verification
Phases: tokens/background, navigation/controls, map wrapper, Overview panels,
interaction states, responsive/performance QA. Inspect browser output between
phases. Fixture QA is explicitly isolated from real wallet and state writes.
Measure render/scroll behavior in the test browser rather than claiming production
frame rates. Preserve reduced motion and visible keyboard focus.

## Preservation boundary
No Pump.fun, Initial Buy, wallet, trading calculations, Paper/Risk Engine,
receipt, metadata, deletion, custody, VPS or Live Trading changes. No deployment.

## QA outcome
Browser fixtures passed at 1440/1280/390: navigation, filters, canonical portraits,
one persistent Overview canvas, no overflow, drawer/focus, hover/press, disabled,
loading/empty and reduced motion. No API writes or wallet requests. The existing
Overview integration test and production build passed. Actual local Overview
also rendered with one canvas and no browser errors.
Headless scroll samples varied (last median 50/33.3/16.7 ms respectively); the
transitional baseline and software rendering do not establish a hardware FPS
guarantee. No production performance improvement is claimed.
