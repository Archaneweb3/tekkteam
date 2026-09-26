// Recover only browser-delivered public resources; backend source is not public.
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';

const origin = 'https://bagworkagent.fun/';
const root = resolve('.reference/bagwork');
const pending = new Set(['index.html', 'styles.css', 'app/main.js', 'app/office3d.js']);
pending.add('brand/og.jpg');
const state = await fetch(new URL('/api/state', origin)).then(r => r.json());
if (process.argv.includes('--config')) {
  const names = { frank: 'Felix Builder', cupsey: 'Nora Signal', fomy: 'Otto Analyst', alon: 'Theo Scout', satoshi: 'Hugo Director', diamond: 'Luca Prism' };
  const config = { ...state.config, preview: true, tradingEnabled: false, launchEnabled: false, contractAddress: '', xUrl: '', siteUrl: '' };
  config.skins = { ...config.skins, items: config.skins.items.map(skin => ({ ...skin, name: names[skin.id] || skin.name })) };
  await writeFile(resolve('public/preview-config.json'), JSON.stringify(config, null, 2).replace(/BAGWORK/g, 'TEKKWORK'));
}
for (const skin of state.config?.skins?.items || []) {
  if (/^[a-z0-9-]+$/.test(skin.id)) for (const variant of ['bust', 'stand']) pending.add(`brand/skins/${skin.id}-${variant}.png`);
}
const seen = new Set(), manifest = [];
while (pending.size) {
  const batch = [...pending].slice(0, 6);
  batch.forEach(p => { pending.delete(p); seen.add(p); });
  await Promise.all(batch.map(async path => {
    const url = new URL(path === 'index.html' ? '' : path, origin);
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) { manifest.push({ path, status: response.status }); return; }
    const bytes = Buffer.from(await response.arrayBuffer());
    const file = resolve(root, path);
    if (!file.startsWith(root + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'))) throw new Error('Invalid path');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
    manifest.push({ path, url: url.href, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    if (!['.html', '.js', '.css'].includes(extname(path))) return;
    const text = bytes.toString();
    const refs = [...text.matchAll(/(?:from\s*|import\s*\(|(?:src|href)\s*=\s*)['"]([^'"<>]+)['"]/g)].map(m => m[1]);
    refs.push(...[...text.matchAll(/['"(]((?:\.?\.?\/)*(?:brand|app|shared)\/[^'"\s)<>$]+\.(?:js|png|jpg|jpeg|svg|webp))['")]/g)].map(m => m[1]));
    for (const ref of refs) {
      if (ref.includes('${') || ref.startsWith('#')) continue;
      const child = new URL(ref, /^(brand|app|shared)\//.test(ref) ? origin : url);
      if (child.origin !== new URL(origin).origin || !/\.(js|css|png|jpg|jpeg|svg|webp)$/.test(child.pathname)) continue;
      const next = child.pathname.slice(1);
      if (!seen.has(next)) pending.add(next);
    }
  }));
}
await writeFile(resolve(root, 'manifest.json'), JSON.stringify({ capturedAt: new Date().toISOString(), resources: manifest }, null, 2));
if (process.argv.includes('--apply')) {
  const preserve = new Set(['app/api.js', 'app/wallet.js', 'app/office3d.js', 'app/boss3d.js', 'app/skins3d.js', 'app/robot.js']);
  for (const { path, status } of manifest) {
    if (status || path === 'index.html' || preserve.has(path) || path.startsWith('brand/')) continue;
    const dest = resolve('public', path);
    await mkdir(dirname(dest), { recursive: true });
    if (['.js', '.css'].includes(extname(path))) {
      let text = await readFile(resolve(root, path), 'utf8');
      text = text.replace(/bagwork/gi, m => m === m.toUpperCase() ? 'TEKKWORK' : m === m.toLowerCase() ? 'tekkwork' : 'Tekkwork');
      text = text.replace(/bw_theme/g, 'tw_theme').replace(/bag work/g, 'team work');
      await writeFile(dest, text);
    } else await copyFile(resolve(root, path), dest);
  }
}
console.log(JSON.stringify({ recovered: manifest.filter(x => !x.status).length, failed: manifest.filter(x => x.status), archive: root }, null, 2));
