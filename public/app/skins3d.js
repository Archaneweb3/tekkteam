import { V, buildToyCharacterMeshes } from './office3d.js';

// Five original brick-figure colorways, all sharing the office character rig.
function toySkin(spec) {
  const parts = buildToyCharacterMeshes(spec);
  const accent = spec.trim;
  parts.torso.vox(-3.6, 0.9, 2.86, 3.6, 1.55, 3.08, accent);
  parts.torso.vox(-2.5, 4.4, -2.73, 2.5, 5.3, -2.5, accent);
  parts.head.stud(-2.4 * V, 10.1 * V, -1.4 * V, 1.1 * V, accent);
  parts.head.stud(2.4 * V, 10.1 * V, -1.4 * V, 1.1 * V, accent);
  if (spec.visor) {
    parts.head.vox(-4.25, 4.2, 5.05, 4.25, 6.4, 5.42, spec.visor);
    parts.head.vox(-3.8, 4.5, 5.43, 3.8, 5.9, 5.52, 0x8ED6FF);
  }
  if (spec.pack) {
    parts.torso.vox(-3.6, 0.6, -5.5, 3.6, 6.4, -2.6, spec.pack);
    for (const x of [-2, 2]) parts.torso.stud(x * V, 6.4 * V, -4 * V, 1.0 * V, accent);
  }
  if (spec.badge) {
    parts.torso.vox(-0.7, 3.6, 3.08, 0.7, 5.2, 3.25, spec.badge);
  }
  return { parts, pose: spec.pose || { armL: 0.08, armR: -0.08, headYaw: 0.1 }, headTop: 11 };
}

const frank = () => toySkin({
  skin: 0xE9B56E, hair: 0x6D4B2B, top: 0x2569C9, pants: 0x203B67,
  kind: 'tee', cap: 0xE8BD4A, trim: 0xFFD873, badge: 0xFFFFFF,
  pose: { armL: 0.2, armR: -0.28, headYaw: -0.12 },
});
const cupsey = () => toySkin({
  skin: 0xF1D6B7, hair: 0x2A6D63, top: 0x4AB9A3, pants: 0x245D6B,
  kind: 'hoodie', cap: 0x2B8D81, trim: 0xF7EEE2, pack: 0x20596A,
  pose: { armL: 0.12, armR: -0.62, headYaw: 0.16 },
});
const fomy = () => toySkin({
  skin: 0xD9A77E, hair: 0x202B4C, top: 0x7653C9, pants: 0x2F285B,
  kind: 'sweater', cap: 0x24294E, trim: 0x90E4FF, visor: 0x17243C,
  pose: { armL: -0.22, armR: 0.15, headYaw: -0.08 },
});
const alon = () => toySkin({
  skin: 0xB97854, hair: 0x68392C, top: 0xE88749, pants: 0x274D91,
  kind: 'tee', style: 'messy', trim: 0xFFF0CF, pack: 0xA95031,
  pose: { armL: 0.3, armR: -0.2, headYaw: 0.2 },
});
const satoshi = () => toySkin({
  skin: 0xF2D4AE, hair: 0x171E31, top: 0x202E53, pants: 0x151E38,
  kind: 'suit', cap: 0x172A50, tie: 0xE7BD55, trim: 0xE7BD55,
  badge: 0xE7BD55, visor: 0x182641,
  pose: { armL: -0.04, armR: -0.06, headYaw: 0.04 },
});

export const SKIN_MODELS = { frank, cupsey, fomy, alon, satoshi };
