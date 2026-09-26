// Original TEKKWORK voxel synths. SVG and PNG use the same seeded block geometry.
const palettes = [
  ['#387ee5', '#93e8ff', '#193555', 'Cobalt operator'],
  ['#26998e', '#b5f3d7', '#254654', 'Signal specialist'],
  ['#8a70d6', '#dbcbff', '#353257', 'Market analyst'],
  ['#cf9548', '#ffdf94', '#3d4764', 'Launch engineer'],
  ['#bccdde', '#67d5eb', '#263f64', 'Studio lead'],
];
const presets = { 'crew-launch': 3, 'crew-shill': 1, 'crew-trade': 2, 'crew-boss': 0, 'skin:frank': 0, 'skin:cupsey': 1, 'skin:fomy': 2, 'skin:alon': 3, 'skin:satoshi': 0, 'skin:diamond': 4 };
export function robotParts(seed, full = false) {
  const hash = [...String(seed)].reduce((n,c) => (Math.imul(n,31) + c.charCodeAt(0)) >>> 0, 17);
  const i = presets[seed] ?? hash % palettes.length;
  const [top, accent, pants, outfitName] = palettes[i];
  return { top, accent, pants, outfitName, hash, full, skin: '#bdceda', hair: top, kind: 'synth', gear: hash % 2 ? 'antenna' : 'headset' };
}
export function robotTraits(seed) {
  const p = robotParts(seed);
  return { outfit: p.outfitName, hair: 'Digital face panel', gear: p.gear === 'antenna' ? 'Signal antenna' : 'Comms headset' };
}
function blocks(p) {
  const b = [];
  const r = (x,y,w,h,c) => b.push([x,y,w,h,c]);
  r(16,90,49,4,'#19334d');
  r(25,70,12,20,p.pants); r(44,70,12,20,p.pants);
  r(22,87,16,5,'#14243a'); r(43,87,16,5,'#14243a');
  r(23,46,34,29,p.top); r(57,49,5,26,p.pants);
  r(28,51,24,3,p.accent); r(28,66,15,3,'#173654');
  r(46,58,6,7,p.accent); r(35,42,10,5,'#6e8ca5');
  r(15,49,7,23,p.top); r(63,49,7,23,p.top);
  r(14,70,9,8,p.skin); r(62,70,9,8,p.skin);
  r(22,15,34,29,p.skin); r(56,18,6,26,'#7995ad');
  r(20,12,38,7,p.top); r(23,9,32,3,p.accent);
  r(26,23,27,17,'#12283e');
  r(30,27,5,4,'#8af3ff'); r(44,27,5,4,'#8af3ff'); r(36,35,8,2,p.accent);
  if(p.gear === 'antenna') { r(48,3,3,7,'#7495b1'); r(46,1,7,4,p.accent); }
  else { r(17,22,5,14,p.top); r(61,22,5,14,p.top); r(16,26,6,5,p.accent); }
  return b;
}
export function robotSVG(seed, { stand = false } = {}) {
  const body = blocks(robotParts(seed)).map(([x,y,w,h,c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`).join('');
  return `<svg class="bot voxel-bot" viewBox="0 0 80 ${stand ? 96 : 76}" shape-rendering="crispEdges" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
export function robotPNG(seed, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#deebf7'; ctx.fillRect(0,0,size,size);
  const s = size / 108, ox = (size - 80 * s) / 2, oy = (size - 96 * s) / 2;
  ctx.imageSmoothingEnabled = false;
  for(const [x,y,w,h,color] of blocks(robotParts(seed))) { ctx.fillStyle=color; ctx.fillRect(ox+x*s,oy+y*s,w*s,h*s); }
  return c.toDataURL('image/png');
}
