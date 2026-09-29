// Canonical identity only; model factories live in skins3d to preserve the rig.
export const CHARACTER_IDS = Object.freeze(['frank', 'cupsey', 'fomy', 'alon', 'satoshi']);
export const OFFICE_CHARACTERS = Object.freeze({launch: 'frank', shill: 'cupsey', trade: 'fomy', boss: 'satoshi'});
export function resolveCharacterId(value) {
  const id = typeof value === 'object' && value ? value.characterId ?? value.character ?? value.skin : value;
  return [...CHARACTER_IDS, 'diamond'].includes(id) ? id : 'frank';
}
export function characterPortraitUrl(value) {
  return `/assets/characters/portraits/${resolveCharacterId(value)}.webp`;
}
