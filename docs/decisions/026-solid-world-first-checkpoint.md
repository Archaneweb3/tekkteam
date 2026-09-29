# 026 — Solid, world-first Overview checkpoint

## Status
Local visual checkpoint only. 2026-09-27. Supersedes 025's pearl/glass art direction.

## Decision
Latest user direction is authoritative: large existing office at left/center,
original 3D device at right, copy and CTAs below, followed by three capability
cards. solid-workspace.css owns this checkpoint only. Cobalt solid surfaces,
gold primary actions, inset edges and physical press replace refraction/blur.
The previously requested BAGWORK/Brawl screenshot pair was not attached in the
latest message; implementation follows the explicit composition description,
not a claimed visual match to unseen references.

Device geometry is CSS-extruded, not an additional WebGL context. Its HTML screen
receives the same fetched network response through a presentation callback in
mountOverview. No new API endpoint, polling interval or trading calculation.
Missing activity is an empty state; unavailable data is a separate error state.
Fixture trades exist only in isolated browser tests, never runtime fallback data.

Existing office renderer/actions and all product logic remain unchanged.
Stats, Employee, New Hires, Trading Desk and Payroll are not redesigned at this
checkpoint. No deployment. Stop for visual review.
