import { chromium } from 'playwright';
const base = process.env.BASE_URL || 'http://127.0.0.1:5188';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#h-office canvas').waitFor();
  await page.addStyleTag({ content: '.office-bubbles{visibility:hidden!important}' });
  await page.locator('#h-office canvas').screenshot({ path: 'public/brand/office-fallback.png', omitBackground: true });
  await page.locator('#h-office canvas').screenshot({ path: 'public/brand/banner.jpg' });
  await page.addStyleTag({ content: '.office-bubbles{visibility:visible!important}' });
  await page.screenshot({ path: 'public/brand/og.jpg', clip: { x: 0, y: 0, width: 1200, height: 630 } });
  for (const skin of [null, 'frank', 'cupsey', 'fomy', 'alon', 'satoshi', 'diamond']) {
    const view = await browser.newPage({ viewport: { width: 512, height: 640 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await view.goto(base, { waitUntil: 'networkidle' });
    await view.evaluate(async (skin) => {
      document.body.innerHTML = '<div id="render" style="width:512px;height:640px"></div>';
      document.head.querySelectorAll('link[rel="stylesheet"],style').forEach(e => e.remove());
      document.body.style.cssText = 'margin:0;background:transparent';
      const { createBoss } = await import('/app/boss3d.js');
      window.captureBoss = createBoss(document.getElementById('render'), { skin });
    }, skin);
    await view.waitForTimeout(300);
    const file = skin ? `public/brand/skins/${skin}-stand.png` : 'public/brand/boss.png';
    await view.locator('#render').screenshot({ path: file, omitBackground: true });
    if (skin) await view.locator('#render').screenshot({ path: `public/brand/skins/${skin}-bust.png`, omitBackground: true });
    else await view.locator('#render').screenshot({ path: 'public/brand/boss-96.png', omitBackground: true });
    await view.close();
  }
  for (const [size, path] of [[96, 'public/favicon.png'], [180, 'public/apple-touch-icon.png']]) {
    await page.evaluate(async size => {
      document.body.innerHTML = '<div id="icon"></div>';
      document.head.querySelectorAll('link[rel="stylesheet"],style').forEach(e => e.remove());
      document.body.style.cssText = 'margin:0;background:transparent';
      const { robotSVG } = await import('/app/robot.js');
      const icon = document.getElementById('icon');
      icon.style.cssText = `width:${size}px;height:${size}px;background:#142135`;
      icon.innerHTML = robotSVG('crew-boss');
    }, size);
    await page.locator('#icon').screenshot({ path });
  }
  await page.close();
  console.log('Rendered office fallback, boss and all six skin assets from the new voxel meshes.');
} finally { await browser.close(); }
