import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const routes = ['/', '/agents', '/tokens', '/launch', '/skins', '/post', '/how', '/agent/1'];
const problems = [];

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport });
      page.on('pageerror', error => problems.push(`${viewport.width} ${route}: ${error.message}`));
      await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
      if (await page.locator('h1:visible').count() !== 1) problems.push(`${viewport.width} ${route}: missing visible heading`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (overflow > 2) problems.push(`${viewport.width} ${route}: horizontal overflow ${overflow}px`);
      if (route === '/skins' && await page.locator('.tt-skin-card-viewer canvas').count() !== 3) problems.push(`${viewport.width} skins: card 3D previews missing`);
      if (route === '/tokens' && await page.locator('.token-laptop-viewer canvas').count() !== 1) problems.push(`${viewport.width} tokens: 3D laptop missing`);
      if (route === '/agent/1' && await page.locator('.agent-detail-viewer canvas').count() !== 1) problems.push(`${viewport.width} agent: 3D viewer missing`);
      await page.close();
    }
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => problems.push(`interaction: ${error.message}`));
  await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
  await page.locator('.agent-row').first().click();
  if (!await page.locator('#agent-panel').isVisible()) problems.push('home: agent click did not open profile');
  await page.goto(`${base}/#/agents`, { waitUntil: 'networkidle' });
  await page.locator('.tt-agent-card').first().click();
  if (!page.url().endsWith('#/agent/1')) problems.push('agents: card did not open detail route');
  await page.locator('.tk-agent-back').click();
  if (!page.url().endsWith('#/agents')) problems.push('detail: back link failed');
  await page.goto(`${base}/#/launch`, { waitUntil: 'networkidle' });
  await page.locator('[name="project"]').fill('Prototype QA');
  await page.locator('[name="tagline"]').fill('A voxel studio');
  await page.locator('.tt-form button[type="submit"]').click();
  await page.reload({ waitUntil: 'networkidle' });
  if (await page.locator('[name="project"]').inputValue() !== 'Prototype QA') problems.push('launch: local draft did not persist');
  await page.locator('[data-action="clear"]').click();
  await page.goto(`${base}/#/skins`, { waitUntil: 'networkidle' });
  await page.locator('[data-skin="Field Notes"]').click();
  if (!await page.locator('[data-skin="Field Notes"]').evaluate(el => el.classList.contains('selected'))) problems.push('skins: selected card did not update');
  if (!await page.locator('.tt-skin-choice').textContent().then(text => text.includes('Field Notes'))) problems.push('skins: selection status did not update');
  await page.close();
} finally {
  await browser.close();
}

if (problems.length) {
  problems.forEach(problem => console.error(problem));
  process.exitCode = 1;
} else console.log('Desktop/mobile routes, 3D viewers, agent navigation, and local draft passed');
