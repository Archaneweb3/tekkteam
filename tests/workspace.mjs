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
      await page.goto(base+'/#/'+route); await page.locator('.tw-header').waitFor();
      await page.waitForTimeout(route==='skins'?800:250);
      assert.ok(await page.locator('h1').count(),`Missing h1: ${route}`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Overflow ${width} ${route}`);
      const content=await page.locator('body').innerText();
      assert.ok(!/BAGWORK|on the payroll|employee of the month|new hires/i.test(content),`Legacy copy: ${route}`);
      assert.ok(!/NaN|undefined/.test(content),`Invalid data: ${route}`);
      if(route==='skins') assert.equal(await page.locator('.boss-gl').count(),6);
      if(route==='launch') { await page.locator('input[value="fomy"]').check({force:true}); assert.equal(await page.locator('#tw-character-name').textContent(),'Otto Analyst'); }
    }
    await page.goto(base); await page.locator('#tw-office canvas').waitFor();
    await page.waitForTimeout(1000);
    await page.screenshot({path:`C:/Users/budir/.codex/visualizations/2026/09/25/01a0d75c-7f92-7a13-b634-6447e9e2f0ec/workspace-${width}.png`,fullPage:true});
    await page.locator('#tw-wallet').click(); await page.locator('dialog').waitFor(); assert.match(await page.locator('dialog').innerText(),/does not send SOL/); await page.keyboard.press('Escape');
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('TEKKWORK routes, characters, mobile widths and wallet dialog passed.');
} finally {await browser.close();}
