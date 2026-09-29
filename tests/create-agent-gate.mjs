import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:5188')+'/#/agents/new');
  const gate=page.locator('.tw-create-access');await gate.waitFor();
  assert.match(await gate.locator('h1').innerText(),/CONNECT YOUR\s+WALLET/);
  assert.equal(await gate.locator('img').getAttribute('src'),'/assets/access/create-agent-wallet-gate.webp');
  await page.waitForFunction(()=>{const image=document.querySelector('.tw-create-access-art');return image?.complete&&image.naturalWidth>0;});
  await gate.locator('img').evaluate(image=>image.decode());
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#tw-create').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:`C:/Users/budir/.codex/visualizations/2026/09/25/01a0d75c-7f92-7a13-b634-6447e9e2f0ec/create-agent-gate-${width}.png`,fullPage:true});
  await gate.locator('#tw-new-connect').click();await page.locator('.tw-connect-dialog[open]').waitFor();
  await page.close();
 }
 console.log('Create Agent locked gate passed at 1440px and 390px.');
}finally{await browser.close();}
