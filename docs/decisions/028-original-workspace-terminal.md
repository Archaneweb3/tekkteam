# 028 — Original workspace terminal asset

## Status
Rejected silhouette. 2026-09-27. The first terminal below is retained as historical
provenance only; it must not be shown in the hero. Replaced by a modern smartphone.

## Decision
Use one original Meshy-generated chunky handheld GLB as presentation hardware.
The existing accessible DOM activity screen continues to render actual Paper
network read data; no transaction, fabricated activity, or baked metric UI is
introduced. A static front camera keeps this DOM plane aligned. This deliberate
constraint avoids an expensive interactive 3D UI and unreadable texture text.
The device is not an iPhone/Bagwork reproduction. The preview added physical
controls beneath the blank screen; these are decorative, not clickable actions.

The existing custom office WebGL2 renderer is untouched. The phone uses a lazy
Three/GLTFLoader chunk via bootstrap because the office renderer has no glTF
loader. It renders only on asset load, resize, or visibility restoration, caps
device pixel ratio at 1.5, and disposes GPU resources on route destruction.
There is no animation loop or motion-dependent screen content. Model load failure
retains the readable dynamic screen with simple hardware framing.

## Provenance and optimization
- Meshy CLI 0.4.0; one preview and one refinement, no regeneration.
- Preview: `01a0dfa7-b60f-71e3-b79e-687551e82cd1` (inspected before refinement).
- Refine: `01a0dfa8-bc8d-7505-bfd6-533c48ba8f1e`.
- Credits: 840 before, 820 after preview, 810 after refinement: 30 total.
- Refined source: approximately 11.21 MB, retained locally in artifacts.
- Web asset: `public/assets/models/tekkwork-terminal.glb`, 681,380 bytes.
- 23,608 triangles, 23,226 vertices, one mesh/primitive, zero animations.
- Three 1024x1024 WebP textures. KHR_mesh_quantization and EXT_texture_webp.
- glTF Transform 4.5.0 optimize: quantize, WebP, texture-size 1024,
  simplify-ratio 0.12, simplify-error 0.001. No new package dependency.
- Runtime roughness/metalness and normal strength are restrained for readable
  navy hardware; original base-color and gold physical accents are preserved.

## Verification
`node tests/phone-model.mjs`: actual GLB loaded/rendered in Chromium; renderer
disposal removed canvas. No API/wallet requests. Syntax checks and diff check pass.
Actual Overview screenshot inspected at 1440 for screen alignment. Whole hardware
and screen share the same small CSS rotation; no independently drifting overlay.
Do not claim broader device GPU performance from this headless smoke test.

## Modern smartphone correction
The user rejected the rugged terminal silhouette and authorized a new, strictly
modern smartphone: rounded rectangular, front-display dominant, no physical front
buttons/D-pad, no thick octagonal shell. Preview inspected before refinement.
- Preview: `01a0dfb5-308a-7495-87ad-965bc06eb29f`.
- Refinement: `01a0dfb6-d5a6-75ca-8668-6b5a6e22c687`.
- Credits: 810 before, 780 after preview + refinement (30 additional).
- Preview geometry width/height: 0.504 (required range 0.48–0.55).
- Screen remains accessible dynamic HTML, now with canonical agent portraits,
  actual action/token/PnL/time where available. Four clearly labeled waiting rows
  preserve density when there is no activity, without inventing transactions.
- New web asset path: `/assets/models/tekkwork-smartphone.glb`.
- Optimized smartphone: 1,227,124 bytes (source approximately 17.08 MB),
  43,474 triangles, 40,014 vertices, one mesh, three 1024px WebP textures,
  zero animations. Same glTF Transform quantization/simplification settings.
- Real GLB render, dense empty rows, canonical portrait mapping from actual
  supplied activity, and renderer disposal verified by `tests/phone-model.mjs`.
