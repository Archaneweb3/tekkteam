import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:5188')+'/#/agent/0f406135-35ea-437d-a27c-29052d279c3b');
  const locked=page.locator('.tw-owner-access');await locked.waitFor();
  assert.match(await locked.locator('h1').innerText(),/YOUR TEAM\s+STAYS YOURS/);
  assert.equal(await locked.locator('.tw-owner-access-stage img').getAttribute('src'),'/assets/characters/portraits/frank.webp');
  assert.equal(await page.locator('.ad-agent-hero').count(),0);
  const geometry=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth,section:document.querySelector('.tw-owner-access').getBoundingClientRect().toJSON()}));
  assert.equal(geometry.scroll>geometry.viewport+1,false,JSON.stringify(geometry));
  await page.screenshot({path:`C:/Users/budir/.codex/visualizations/2026/09/25/01a0d75c-7f92-7a13-b634-6447e9e2f0ec/owner-access-${width}.png`,fullPage:true});
  await locked.locator('#tw-detail-connect').click();await page.locator('.tw-connect-dialog[open]').waitFor();
  await page.close();
 }
 console.log('Owner access visual fixture passed at 1440px and 390px.');
}finally{await browser.close();}
