import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL || 'http://127.0.0.1:5188';
const browser=await chromium.launch({headless:true});
const errors=[];
try {
  for (const width of [1440, 768, 390, 320]) {
    const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1});
    page.on('pageerror',e=>errors.push(e.message));
    for (const route of ['', 'agents', 'tokens', 'launch', 'skins', 'how']) {
      await page.goto(base+'/#/'+route); await page.locator('.tw-header').waitFor({state:'attached'});
      await page.waitForTimeout(route==='skins'?800:250);
      await page.locator('h1').first().waitFor({timeout:5000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Overflow ${width} ${route}`);
      const content=await page.locator('body').innerText();
      assert.ok(!/BAGWORK/i.test(content),`Legacy branding: ${route}`);
      assert.ok(content.includes('TEKKTEAM'),`Current branding missing: ${route}`);
      assert.ok(!/NaN|undefined/.test(content),`Invalid data: ${route}`);
      if(route==='skins') assert.equal(await page.locator('.boss-gl').count(),6);
    }
    await page.goto(base); await page.locator('#tw-office canvas').waitFor();
    await page.waitForTimeout(1000);
    await page.screenshot({path:`C:/Users/budir/.codex/visualizations/2026/09/25/01a0d75c-7f92-7a13-b634-6447e9e2f0ec/workspace-${width}.png`,fullPage:true});
    // Wallet interaction is covered by workspace-auth.mjs; this route's legacy header is inert.
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('TEKKTEAM routes, current branding and mobile widths passed.');
} finally {await browser.close();}
