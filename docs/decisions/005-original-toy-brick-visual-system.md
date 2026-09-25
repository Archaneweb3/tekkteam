# ADR-005: Original toy-brick 3D visual system

## Status

Accepted

## Date

2026-09-26

## Context

The user asked to replace every visible 3D character and object with a distinct LEGO-like aesthetic while retaining the existing AI-agent frontend routes and interactions. The recovered WebGL scenes and 2D avatars were previously voxel-based and visually close to the reference site.

## Decision

Use an original, unbranded toy-brick language built from procedural boxes, cylinders, studs, and a cobalt-led palette. Share the character construction between the office, boss viewer, and five skin variants. Update the office baseplate, modular furniture, boss display plinth, phone shell, and small SVG avatars. Do not use the LEGO name, logo, minifigure silhouette, or third-party branded model files in the UI. Keep the existing WebGL rig, camera controls, hit targets, routes, and read-only data behavior.

## Consequences

The site has no external 3D asset dependency for the new style. Geometric details can be recolored or edited in source, but they need browser rendering QA in addition to unit/smoke tests. Static legacy PNG files may remain in the asset directory for historical recovery, but active UI paths use procedural 3D or the new SVG avatar fallback.
