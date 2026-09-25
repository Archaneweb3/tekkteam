import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const routes = ['/', '/agents', '/tokens', '/launch', '/skins', '/how', '/agent/4'];
const problems = [];

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport });
      page.on('pageerror', (error) => problems.push(`${viewport.width} ${route}: ${error.message}`));
      page.on('request', (request) => {
        if (request.url().includes('/api/')) problems.push(`${viewport.width} ${route}: production API request`);
      });
      await page.goto(`${base}/#${route}`, { waitUntil: 'domcontentloaded' });
      await page.locator('#page').waitFor();
      try { await page.locator('#page h1, #page h2').first().waitFor({ timeout: 5000 }); }
      catch { problems.push(`${viewport.width} ${route}: missing page heading`); }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (overflow > 2) problems.push(`${viewport.width} ${route}: horizontal overflow ${overflow}px`);
      if (route === '/') {
        if (!await page.locator('#h-office canvas').count()) problems.push(`${viewport.width} home: 3D office missing`);
        if (!await page.locator('#h-phone canvas').count()) problems.push(`${viewport.width} home: 3D phone missing`);
        if (!await page.locator('#h-boss canvas').count()) problems.push(`${viewport.width} home: 3D boss missing`);
        const stageOrder = await page.evaluate(() => {
          const office = document.querySelector('#h-office')?.getBoundingClientRect();
          const phone = document.querySelector('#h-phone')?.getBoundingClientRect();
          return office && phone ? { officeWidth: office.width, phoneBelow: phone.top >= office.bottom - 2 } : null;
        });
        if (stageOrder && (!stageOrder.phoneBelow || stageOrder.officeWidth < viewport.width * .88))
          problems.push(`${viewport.width} home: map-led layout regressed`);
      }
      if (route === '/agent/4' && !await page.locator('#page canvas').count()) problems.push(`${viewport.width} detail: 3D avatar missing`);
      if (route === '/launch' && !await page.locator('#l-submit').isDisabled()) problems.push(`${viewport.width} launch: transaction action enabled`);
      if (route === '/skins' && await page.locator('[data-get]:not([disabled])').count()) problems.push(`${viewport.width} skins: purchase action enabled`);
      await page.close();
    }
  }

  const page = await browser.newPage();
  await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#page h1').waitFor();
  await page.locator('#nav a[href="#/agents"]').click();
  if (!page.url().endsWith('#/agents')) problems.push('navigation: agents route failed');
  await page.locator('#nav a[href="#/skins"]').click();
  if (!page.url().endsWith('#/skins')) problems.push('navigation: skins route failed');
  await page.locator('#theme-btn').click();
  if (await page.locator('html').getAttribute('data-theme') !== 'light') problems.push('theme: light palette did not activate');
  await page.close();

  for (const width of [320, 390, 768, 1024]) {
    const mobile = await browser.newPage({ viewport: { width, height: 844 } });
    mobile.on('pageerror', (error) => problems.push(`${width} responsive: ${error.message}`));
    await mobile.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
    await mobile.locator('#h-office canvas').waitFor();
    const sizing = await mobile.evaluate(() => ({
      viewport: innerWidth,
      page: document.documentElement.scrollWidth,
      office: document.querySelector('#h-office').getBoundingClientRect().width,
      header: document.querySelector('.topbar').getBoundingClientRect().height,
    }));
    const minOfficeWidth = width > 900 ? sizing.viewport * 0.45 : sizing.viewport * 0.9;
    if (sizing.office < minOfficeWidth) problems.push(`${width} responsive: office collapsed to ${sizing.office}px`);
    if (sizing.page > sizing.viewport + 2) problems.push(`${width} responsive: horizontal overflow`);
    if (width === 320 && sizing.header > 125) problems.push('320 responsive: header consumes too much height');
    const markers = await mobile.locator('#h-office .office-bubbles .ob').count();
    if (markers !== 4) problems.push(`${width} responsive: expected four workspace zone markers, got ${markers}`);
    if (width === 320) {
      await mobile.locator('#h-office .ob-launch').click();
      if (!mobile.url().endsWith('#/launch')) problems.push('320 responsive: office action did not navigate');
    }
    if (width === 390) {
      await mobile.goto(`${base}/#/skins`, { waitUntil: 'domcontentloaded' });
      const activeVisible = await mobile.locator('#nav a.on').evaluate((el) => {
        const link = el.getBoundingClientRect();
        const nav = el.closest('#nav').getBoundingClientRect();
        return link.left >= nav.left && link.right <= nav.right;
      });
      if (!activeVisible) problems.push('390 responsive: active navigation hidden offscreen');
    }
    await mobile.close();
  }

  for (const [role, expected] of [['launch', '#/launch'], ['shill', 'dialog'], ['trade', 'home'], ['how', '#/how']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
    await page.locator(`#h-office .ob-${role}`).click();
    if (expected.startsWith('#/') && !page.url().endsWith(expected)) problems.push(`workspace ${role}: navigation failed`);
    if (expected === 'dialog' && !await page.locator('[role="dialog"]').count()) problems.push('workspace shill: dialog did not open');
    if (expected === 'home' && !page.url().endsWith('#/')) problems.push('workspace trade: action changed route unexpectedly');
    await page.close();
  }
} finally {
  await browser.close();
}

if (problems.length) {
  problems.forEach((problem) => console.error(problem));
  process.exitCode = 1;
} else console.log('Reference routes, local data, responsive layout, and 3D scenes passed');
