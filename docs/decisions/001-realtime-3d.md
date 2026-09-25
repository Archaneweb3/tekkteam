# ADR-001: Build the new studio as a real-time 3D scene

## Status

Accepted

## Date

2026-09-25

## Context

The previous prototype painted a perspective room into one image and layered 2D character sprites on top. That made floor collision, foreground occlusion, hover, and movement disagree with the visible furniture. The new reference uses a boxy voxel character language in an isometric room; the user explicitly wants 3D.

## Decision

Use Three.js/WebGL meshes for the room, furniture, and original voxel characters. Keep labels, cards, and navigation in HTML. Use raycasting for character hover/click and a single world-coordinate grid for agent movement around furniture. Begin with an interactive prototype, not a fake connected token or wallet workflow.

## Alternatives considered

- **Painted 3D illustration plus 2D sprites:** faster still image, but repeats the depth and collision failures that prompted the rebuild.
- **Pre-rendered sprite sheets from 3D models:** useful for a fixed camera, but prevents meaningful orbiting and complicates click/depth matching.
- **A full game engine:** more features than this browser prototype needs, with a larger runtime and integration cost.

## Consequences

- The characters and room can be viewed from multiple angles, and the visual geometry can align with interaction and navigation.
- The browser needs WebGL support and more GPU work than a static illustration. Pixel ratio is capped, and the scene is deliberately small.
- The prototype is not visually identical to BAGWORK and does not copy its source or assets. Further art direction and production backend integration require separate approval.
