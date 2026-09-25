import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const root = new URL('../public/', import.meta.url);
const agentDir = new URL('demo-agents/', root);
const mediaDir = new URL('demo-media/', root);
const files = [new URL('demo-state.json', root), ...(await readdir(agentDir)).filter((name) => name.endsWith('.json')).map((name) => new URL(name, agentDir))];
const records = await Promise.all(files.map(async (file) => ({ file, data: JSON.parse(await readFile(file, 'utf8')) })));
const urls = new Set();

function visit(value, replace = false, replacements = new Map()) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'icon' || key === 'image') && typeof item === 'string' && item.startsWith('https://')) {
      if (replace && replacements.has(item)) value[key] = replacements.get(item);
      else if (!replace) urls.add(item);
    } else visit(item, replace, replacements);
  }
}

records.forEach(({ data }) => visit(data));
await mkdir(mediaDir, { recursive: true });
const replacements = new Map();
const queue = [...urls].sort((a, b) => Number(b.includes('dexscreener.com')) - Number(a.includes('dexscreener.com')));
let cursor = 0;

async function worker() {
  while (cursor < queue.length) {
    const url = queue[cursor++];
    try {
      const source = url.startsWith('https://ipfs.io/ipfs/')
        ? url.replace('https://ipfs.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/')
        : url;
      const response = await fetch(source, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get('content-type') || '';
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('jpeg') || type.includes('jpg') ? 'jpg' : null;
      if (!ext) throw new Error(`Unsupported media type: ${type}`);
      const filename = `${createHash('sha256').update(url).digest('hex').slice(0, 20)}.${ext}`;
      await writeFile(new URL(filename, mediaDir), Buffer.from(await response.arrayBuffer()));
      replacements.set(url, `/demo-media/${filename}`);
    } catch (error) {
      console.warn(`Could not localize ${url}: ${error.message}`);
    }
  }
}

await Promise.all(Array.from({ length: 8 }, worker));
for (const { file, data } of records) {
  visit(data, true, replacements);
  await writeFile(file, JSON.stringify(data));
}
console.log(`Localized ${replacements.size}/${urls.size} remote image assets.`);
