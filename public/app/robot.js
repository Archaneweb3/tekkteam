// TEKKTEAM crew: every agent is a little voxel office worker (hair, skin, outfit, gear),
// drawn as pixel blocks with a darker side face so it reads like a 3D voxel figure.
// Everything is generated from a seed (the agent's avatar seed): same agent, same worker.
// API kept from the old generator: robotSVG(seed, { stand }), robotPNG(seed), robotTraits(seed).
import { seededRng } from '../shared/util.js';

const W = 20;            // grid width
const BUST_H = 20;       // head + shoulders (square avatar)
const BODY_H = 31;       // full body on a floor tile (stand: true)

const SKINS = [['#F6C9A2', 3], ['#EDB58A', 3], ['#D39A6E', 2], ['#A86F4A', 2], ['#7A4F34', 1], ['#FCDCC2', 2]];
const HAIRS = [
  ['#6E3B1F', 4, 'Brown'], ['#2A1E19', 4, 'Black'], ['#C8923F', 2, 'Blond'], ['#9A3F1E', 1, 'Ginger'],
  ['#CFCFCF', 1, 'Silver'], ['#4A3326', 2, 'Dark brown'], ['#E05A8C', 0.4, 'Pink'], ['#3F6FE0', 0.4, 'Blue'],
];
// [kind, weight, name, top colour, trouser colour]
const OUTFITS = [
  ['suit', 5, 'Black suit', '#232327', '#1B1B1E'],
  ['suit', 1, 'Navy suit', '#26314F', '#1E2740'],
  ['suit', 1, 'Grey suit', '#6B6E75', '#4E5057'],
  ['hoodie', 2, 'Green hoodie', '#2F6B3F', '#34466B'],
  ['hoodie', 1, 'Grey hoodie', '#8A8D94', '#34466B'],
  ['hoodie', 1, 'Black hoodie', '#2A2A2E', '#2F3B5A'],
  ['shirt', 2, 'White shirt', '#F1EFEA', '#2B2B30'],
  ['shirt', 1, 'Blue shirt', '#A9C4EA', '#2B2B30'],
  ['tee', 1, 'Beige tee', '#E6D6B8', '#5B4A3A'],
];
const TIES = ['#E4282E', '#E4282E', '#E4282E', '#2F5FD0', '#2FA84F', '#E3A92B', '#1B1B1E'];
const GEAR = [['none', 5], ['glasses', 2], ['cap', 2], ['headphones', 2], ['shades', 1]];
const CAPS = ['#2F5FD0', '#E4282E', '#1F1F22', '#2FA84F', '#F1EFEA'];

function wpick(list, rand) {
  const total = list.reduce((s, x) => s + x[1], 0);
  let r = rand() * total;
  for (const x of list) { r -= x[1]; if (r < 0) return x; }
  return list[list.length - 1];
}
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

function mix(hex, to, amt) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - amt) + ((b >> 16) & 255) * amt);
  const g = Math.round(((a >> 8) & 255) * (1 - amt) + ((b >> 8) & 255) * amt);
  const bl = Math.round((a & 255) * (1 - amt) + (b & 255) * amt);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}

// the office crew always looks like the 3D characters
const PRESETS = {
  'crew-launch': { skin: '#F2BD93', hair: '#2E221C', hairName: 'Black', kind: 'tee', outfitName: 'White tee', top: '#F0EEE9', pants: '#2B2B30', gear: 'cap', cap: '#2F5FD0', style: 'messy', bag: false },
  'crew-shill': { skin: '#EFBE95', hair: '#1D1916', hairName: 'Black', kind: 'shirt', outfitName: 'White shirt', top: '#F3F1EC', pants: '#3A3B42', gear: 'none', style: 'messy', bag: false },
  'crew-trade': { skin: '#F0BE92', hair: '#6E3B1F', hairName: 'Brown', kind: 'hoodie', outfitName: 'Green sweater', top: '#2F6B3F', pants: '#2B2B30', gear: 'glasses', style: 'side', bag: false },
  'crew-boss': { skin: '#F5BC8C', hair: '#7A4424', hairName: 'Brown', kind: 'suit', outfitName: 'Black suit', top: '#1E1E22', pants: '#1E1E22', tie: '#E4282E', gear: 'none', style: 'side', bag: true },
};

// ── traits ──
export function robotParts(seed, full = false) {
  if (PRESETS[seed]) return { tie: '#E4282E', cap: '#2F5FD0', ...PRESETS[seed], full };
  const rand = seededRng('bag-' + seed);
  const skin = wpick(SKINS, rand)[0];
  const [hair, , hairName] = wpick(HAIRS, rand);
  const [kind, , outfitName, top, pants] = wpick(OUTFITS, rand);
  const tie = pick(TIES, rand);
  let gear = wpick(GEAR, rand)[0];
  const cap = pick(CAPS, rand);
  const style = pick(['side', 'side', 'messy', 'buzz', 'long', 'quiff'], rand);
  const bag = rand() < 0.35;          // carries a briefcase (full body only)
  if (gear === 'cap' && style === 'long' && rand() < 0.5) gear = 'none';
  return { skin, hair, hairName, kind, outfitName, top, pants, tie, gear, cap, style, bag, full };
}

export function robotTraits(seed) {
  const p = robotParts(seed);
  const gearName = { none: '', glasses: 'Glasses', cap: 'Cap', headphones: 'Headphones', shades: 'Shades' }[p.gear];
  // kept the old keys (casing / screen) so older callers still work
  return { outfit: p.outfitName, hair: p.hairName + ' hair', gear: gearName, casing: p.outfitName, screen: p.hairName + ' hair' };
}

// ── pixel grid ──
function buildGrid(p) {
  const H = p.full ? BODY_H : BUST_H;
  const g = Array.from({ length: H }, () => Array(W).fill(''));
  const put = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c); };

  // head block: cols 4..15 (front 4..13, side 14..15), rows 2..12
  const hx0 = 4, hx1 = 13, hs1 = 15, hy0 = 2, hy1 = 12;
  rect(hx0, hy0 + 2, hx1, hy1, 'S');       // face
  rect(hx1 + 1, hy0 + 2, hs1, hy1, 's');   // side of the head (shaded)
  put(3, 7, 'S'); put(3, 8, 's');          // ear
  // hair
  const hairTop = (y) => { rect(hx0 - 1, y, hs1, y, 'H'); };
  if (p.style === 'buzz') {
    rect(hx0, hy0 + 1, hs1, hy0 + 2, 'H'); rect(hx0, hy0 + 1, hs1, hy0 + 1, 'h');
    put(hx0, hy0 + 3, 'H'); put(hs1, hy0 + 3, 'd');
  } else {
    hairTop(hy0); rect(hx0, hy0 - 1, hs1 - 1, hy0 - 1, 'h');
    rect(hx0 - 1, hy0 + 1, hs1, hy0 + 2, 'H');
    rect(hx0 - 1, hy0 + 3, hx0, hy0 + 5, 'H');             // side at the front
    rect(hs1 - 1, hy0 + 3, hs1, hy0 + 6, 'd');             // side at the back (shaded)
    if (p.style === 'side') { rect(hx0 + 1, hy0 + 3, hx0 + 5, hy0 + 3, 'H'); put(hx0 + 1, hy0 + 4, 'H'); put(hx1 - 1, hy0 + 3, 'H'); }
    if (p.style === 'messy') { put(hx0 + 2, hy0 - 2, 'H'); put(hx0 + 6, hy0 - 2, 'H'); put(hx0 + 9, hy0 - 2, 'h'); rect(hx0 + 1, hy0 + 3, hx1, hy0 + 3, 'H'); put(hx0 + 4, hy0 + 4, 'H'); put(hx0 + 8, hy0 + 4, 'H'); }
    if (p.style === 'quiff') { rect(hx0 + 2, hy0 - 2, hx0 + 7, hy0 - 2, 'h'); rect(hx0 + 3, hy0 - 3, hx0 + 6, hy0 - 3, 'h'); rect(hx0 + 1, hy0 + 3, hx0 + 3, hy0 + 3, 'H'); }
    if (p.style === 'long') { rect(hx0 - 1, hy0 + 3, hx0, hy1 + 1, 'H'); rect(hs1 - 1, hy0 + 3, hs1 + 1, hy1 + 1, 'd'); rect(hx0 + 1, hy0 + 3, hx1, hy0 + 3, 'H'); }
  }
  // face
  const ey = 7;
  rect(6, ey, 7, ey + 1, 'E'); rect(10, ey, 11, ey + 1, 'E');   // eyes (2x2, like the mascot)
  put(9, ey + 2, 'n'); put(9, ey + 3, 'n');                      // nose block (lighter)
  rect(8, 11, 10, 11, 'm');                                      // mouth
  // gear
  if (p.gear === 'glasses') { rect(5, ey - 1, 8, ey - 1, 'G'); rect(9, ey - 1, 12, ey - 1, 'G'); put(5, ey, 'G'); put(8, ey, 'G'); put(9, ey, 'G'); put(12, ey, 'G'); put(5, ey + 1, 'G'); put(12, ey + 1, 'G'); rect(13, ey - 1, 15, ey - 1, 'G'); }
  if (p.gear === 'shades') { rect(5, ey - 1, 12, ey - 1, 'G'); rect(5, ey, 8, ey + 1, 'G'); rect(9, ey, 12, ey + 1, 'G'); put(6, ey, 'w'); put(10, ey, 'w'); rect(13, ey - 1, 15, ey - 1, 'G'); }
  if (p.gear === 'cap') {
    rect(hx0 - 1, hy0 - 1, hs1, hy0 + 2, 'C'); rect(hx0, hy0 - 2, hs1 - 1, hy0 - 2, 'c');
    rect(hs1 - 1, hy0 + 1, hs1, hy0 + 2, 'k');                 // cap side
    rect(hx0 - 2, hy0 + 2, hx0 + 4, hy0 + 3, 'k');             // brim to the side, like the image
  }
  if (p.gear === 'headphones') {
    rect(hx0 - 1, hy0 - 2, hs1, hy0 - 2, 'P'); put(hx0 - 1, hy0 - 1, 'P'); put(hs1, hy0 - 1, 'P');
    rect(2, 6, 4, 10, 'P'); put(3, 8, 'p');                    // ear cup
  }

  // neck + shoulders
  const by = 13;
  rect(8, by - 1, 11, by - 1, 's');
  const torsoBottom = p.full ? 22 : BUST_H - 1;
  rect(3, by, 14, torsoBottom, 'T');        // front of the torso
  rect(15, by, 16, torsoBottom, 't');       // side (shaded)
  if (!p.full) { rect(1, by + 2, 2, torsoBottom, 'T'); rect(17, by + 2, 18, torsoBottom, 't'); rect(1, by + 1, 18, by + 1, 'T'); put(1, by + 1, ''); put(18, by + 1, ''); rect(15, by + 1, 18, by + 1, 't'); }
  if (p.kind === 'suit') {
    rect(7, by, 12, by, 'W'); rect(8, by + 1, 11, by + 1, 'W'); rect(8, by + 2, 11, by + 2, 'W');
    rect(9, by, 10, by + 7, 'R'); rect(9, by, 10, by, 'r');           // tie
    put(7, by + 1, 'L'); put(12, by + 1, 'L'); put(7, by + 2, 'L'); put(12, by + 2, 'L'); put(8, by + 3, 'L'); put(11, by + 3, 'L'); // lapels
  } else if (p.kind === 'hoodie') {
    rect(6, by, 13, by, 'L'); put(8, by + 1, 'W'); put(8, by + 2, 'W'); put(11, by + 1, 'W'); put(11, by + 2, 'W');
    rect(6, by + 5, 13, by + 6, 'L');                                  // pocket line
  } else if (p.kind === 'shirt') {
    rect(8, by, 11, by, 'L'); put(9, by + 1, 'L'); put(10, by + 1, 'L');
    for (let y = by + 2; y <= torsoBottom; y += 2) put(9, y, 'L');   // buttons
  } else {
    rect(8, by, 11, by, 'S');
  }

  if (p.full) {
    // arms + hands
    rect(1, by + 1, 2, 21, 'T'); rect(17, by + 1, 18, 21, 't');
    rect(1, by + 8, 2, by + 8, p.kind === 'suit' ? 'W' : 'L'); rect(17, by + 8, 18, by + 8, p.kind === 'suit' ? 'W' : 'L');
    rect(1, 22, 2, 23, 'S'); rect(17, 22, 18, 23, 's');
    // legs + shoes
    rect(4, 23, 8, 27, 'K'); rect(10, 23, 14, 27, 'K'); rect(15, 23, 15, 27, 'k');
    rect(9, 23, 9, 24, 'K');
    rect(3, 28, 8, 29, 'B'); rect(10, 28, 15, 29, 'B'); rect(15, 28, 16, 29, 'b');
    if (p.bag) { rect(0, 22, 5, 26, 'Q'); rect(1, 21, 4, 21, 'q'); put(2, 21, ''); put(3, 21, ''); rect(2, 20, 3, 20, 'q'); rect(0, 24, 5, 24, 'q'); rect(2, 24, 3, 24, 'Y'); rect(5, 22, 5, 26, 'q'); }
    // floor shadow
    rect(2, 30, 17, 30, 'Z');
  }
  return g;
}

function colours(p) {
  const pantsTone = p.kind === 'suit' ? p.top : p.pants;
  return {
    S: p.skin, s: mix(p.skin, '#5A2E14', 0.22), n: mix(p.skin, '#FFFFFF', 0.28), m: mix(p.skin, '#5A2E14', 0.42),
    E: '#17120F', w: '#8BB8FF',
    H: p.hair, h: mix(p.hair, '#FFFFFF', 0.16), d: mix(p.hair, '#000000', 0.28),
    G: '#141416',
    C: p.cap, c: mix(p.cap, '#FFFFFF', 0.2), k: mix(p.cap, '#000000', 0.3),
    P: '#1C1C20', p: '#E4282E',
    T: p.top, t: mix(p.top, '#000000', 0.3), L: mix(p.top, p.kind === 'shirt' || p.kind === 'tee' ? '#8A8272' : '#000000', 0.35),
    W: '#F7F5F0', R: p.tie, r: mix(p.tie, '#000000', 0.25),
    K: pantsTone, k: mix(pantsTone, '#000000', 0.3), B: '#121214', b: '#050506',
    Q: '#8A4F24', q: '#5C3215', Y: '#E8B32E',
    Z: 'rgba(0,0,0,0.16)',
  };
}

// voxel seams: every block gets a faint darker outline, like the plastic blocks of the mascot
function gridToSVG(g, col, id) {
  const H = g.length;
  let body = '';
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = g[y][x];
      if (!c) { x++; continue; }
      let w = 1;
      while (x + w < W && g[y][x + w] === c) w++;
      body += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${col[c]}"/>`;
      x += w;
    }
  }
  const seams = `<pattern id="${id}" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M0 0H1V1" fill="none" stroke="rgba(0,0,0,.14)" stroke-width=".12"/><path d="M0 1V0.06H0.94" fill="none" stroke="rgba(255,255,255,.18)" stroke-width=".12"/></pattern>`;
  let mask = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] && g[y][x] !== 'Z') mask += `M${x} ${y}h1v1h-1z`;
  return { body, defs: `<defs>${seams}</defs>`, overlay: `<path d="${mask}" fill="url(#${id})"/>`, H };
}

const cache = new Map();
let uid = 0;

// Inline SVG string. stand: true draws the whole worker standing on the floor.
export function robotSVG(seed, { stand = false } = {}) {
  const palettes = [
    ['#2766d0', '#f3c457', '#1c448e'], ['#3cb6b1', '#eed9a4', '#175d80'],
    ['#765ac8', '#efb484', '#34336d'], ['#e69452', '#e7b991', '#1c5c9c'],
    ['#4e9f78', '#d9a87f', '#26526f'],
  ];
  const hash = [...String(seed)].reduce((n, c) => ((n * 31 + c.charCodeAt(0)) >>> 0), 7);
  const [shirt, face, pants] = palettes[hash % palettes.length];
  const hair = ['#332c31', '#795036', '#1b304c', '#ad693a'][hash % 4];
  const accessory = hash % 3;
  const body = `<ellipse cx="40" cy="91" rx="25" ry="5" fill="#091b40" opacity=".18"/>
    <rect x="23" y="48" width="34" height="27" rx="4" fill="${shirt}" stroke="#142a56" stroke-width="2"/>
    <rect x="27" y="52" width="26" height="3" rx="1" fill="#fff" opacity=".24"/>
    <rect x="27" y="74" width="11" height="15" rx="2" fill="${pants}" stroke="#142a56" stroke-width="2"/>
    <rect x="42" y="74" width="11" height="15" rx="2" fill="${pants}" stroke="#142a56" stroke-width="2"/>
    <rect x="19" y="50" width="6" height="20" rx="3" fill="${shirt}"/><rect x="55" y="50" width="6" height="20" rx="3" fill="${shirt}"/>
    <circle cx="22" cy="70" r="4" fill="${face}"/><circle cx="58" cy="70" r="4" fill="${face}"/>
    <rect x="36" y="42" width="8" height="8" rx="2" fill="${face}"/>
    <rect x="27" y="17" width="26" height="29" rx="7" fill="${face}" stroke="#85583d" stroke-width="1"/>
    <ellipse cx="40" cy="17" rx="13" ry="4" fill="${face}"/>
    <rect x="27" y="14" width="26" height="10" rx="4" fill="${hair}"/>
    <rect x="29" y="27" width="5" height="5" rx="1" fill="#17243e"/><rect x="46" y="27" width="5" height="5" rx="1" fill="#17243e"/>
    <path d="M37 37q3 3 6 0" fill="none" stroke="#92513e" stroke-width="1.5" stroke-linecap="round"/>
    ${accessory === 0 ? `<rect x="25" y="26" width="12" height="9" rx="2" fill="none" stroke="#192c59" stroke-width="2"/><rect x="43" y="26" width="12" height="9" rx="2" fill="none" stroke="#192c59" stroke-width="2"/><path d="M37 30h6" stroke="#192c59" stroke-width="2"/>` : ''}
    ${accessory === 1 ? `<rect x="24" y="11" width="32" height="5" rx="2" fill="${shirt}"/><circle cx="40" cy="11" r="3" fill="${shirt}"/>` : ''}`;
  return `<svg class="bot toy-bot" viewBox="0 0 80 ${stand ? 96 : 78}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  // paid skins: the server sends avatarSeed "skin:<id>" for agents wearing one
  if (typeof seed === 'string' && seed.startsWith('skin:')) {
    const id = seed.slice(5).replace(/[^a-z0-9-]/g, '');
    const H = stand ? BODY_H : BUST_H;
    return `<svg class="bot skin-bot" viewBox="0 0 ${W} ${H}" aria-hidden="true"><image href="brand/skins/${id}-${stand ? 'stand' : 'bust'}.png" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMax meet"/></svg>`;
  }
  const key = seed + (stand ? ':s' : '');
  if (cache.has(key)) return cache.get(key).replace(/__ID__/g, 'vx' + (++uid));
  const p = robotParts(seed, stand);
  const g = buildGrid(p);
  const r = gridToSVG(g, colours(p), '__ID__');
  const svg = `<svg class="bot" viewBox="0 0 ${W} ${r.H}" shape-rendering="crispEdges" aria-hidden="true">${r.defs}${r.body}${r.overlay}</svg>`;
  cache.set(key, svg);
  return svg.replace(/__ID__/g, 'vx' + (++uid));
}

// PNG of an agent's worker (default coin image): full body, centred on a warm office tile so it
// survives pump.fun's round crop.
export function robotPNG(seed, size = 512) {
  const p = robotParts(seed, true);
  const g = buildGrid(p);
  const col = colours(p);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // background: office floor tiles
  ctx.fillStyle = '#EFEBE3';
  ctx.fillRect(0, 0, size, size);
  const tile = size / 8;
  ctx.fillStyle = '#E4DED3';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) ctx.fillRect(x * tile, y * tile, tile, tile);
  const cell = Math.floor((size * 0.74) / BODY_H);
  const ox = Math.round((size - cell * W) / 2);
  const oy = Math.round((size - cell * BODY_H) / 2) + cell;
  g.forEach((row, y) => row.forEach((ch, x) => {
    if (!ch) return;
    ctx.fillStyle = col[ch];
    ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    if (ch === 'Z') return;
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.fillRect(ox + x * cell, oy + (y + 1) * cell - Math.max(1, cell / 9), cell, Math.max(1, cell / 9));
    ctx.fillRect(ox + (x + 1) * cell - Math.max(1, cell / 9), oy + y * cell, Math.max(1, cell / 9), cell);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(ox + x * cell, oy + y * cell, cell, Math.max(1, cell / 10));
  }));
  return c.toDataURL('image/png');
}
