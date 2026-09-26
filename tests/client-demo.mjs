import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  const errors=[], api=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api.push(r.url());});
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:950});
    for(const route of ['','launch','skins','agents','tokens','how']) {
      await page.goto(`${process.env.DEMO_URL || 'http://127.0.0.1:5199'}/#/${route}`);
      await page.locator('.tw-system').waitFor();
      assert.match(await page.locator('.tw-system').innerText(),/CLIENT DEMO/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      if(route==='launch') {
        await page.locator('#tw-character-preview canvas').waitFor();
        await page.locator('#tw-wallet').click();
        assert.match(await page.locator('#tw-toast').innerText(),/Client demo/);
        assert.equal(await page.locator('dialog').count(),0);
      }
    }
  }
  assert.deepEqual(errors,[]); assert.deepEqual(api,[]);
  console.log('Client demo: six routes, desktop/mobile, character canvas, no API calls or wallet auth passed.');
} finally {await browser.close();}
