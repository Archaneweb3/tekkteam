// Frontend-only Guide interaction regression; no wallet or trading actions.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const expected={
 'getting-started':['GETTING STARTED','01','MONITOR RESULTS'],
 'agents-guide':['AI AGENTS','RISK PROFILE','START'],
 'trading-risk':['TRADING & RISK','SLIPPAGE','not a guaranteed fill price'],
 'wallets-guide':['WALLETS','OWNER WALLET','PAPER FUNDS'],
 'tokens-guide':['TOKENS','MINT / CA','LAUNCHED'],
 'paper-real':['PAPER VS REAL','Simulated funds','Solana Mainnet transactions']
};
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5188/#/how');
  assert.equal(await page.locator('.tw-guide-lessons').count(),0);
  assert.equal(await page.locator('[data-guide-category]').count(),6);
  for(const [id,phrases] of Object.entries(expected)){
   const card=page.locator(`[data-guide-category="${id}"]`);
   await card.scrollIntoViewIfNeeded();
   const before=await page.evaluate(()=>scrollY);
   await card.click();
   const dialog=page.getByRole('dialog');
   await dialog.waitFor();
   assert.equal(await dialog.locator('h2').innerText(),phrases[0]);
   for(const phrase of phrases.slice(1))assert.match(await dialog.innerText(),new RegExp(phrase,'i'));
   assert.equal(new URL(page.url()).hash,'#/how');
   assert.ok(Math.abs((await page.evaluate(()=>scrollY))-before)<=1,`${id} changed scroll on open at ${width}px`);
   if(id==='getting-started'){
    await page.keyboard.press('Escape');
   }else if(id==='agents-guide'){
    await dialog.locator('.tw-guide-drawer-close').click();
   }else if(id==='trading-risk'){
    await page.mouse.click(5,5);
   }else{
    await dialog.locator('.tw-guide-drawer-close').click();
   }
   await dialog.waitFor({state:'detached'});
   assert.ok(Math.abs((await page.evaluate(()=>scrollY))-before)<=1,`${id} changed scroll on close at ${width}px`);
   assert.equal(await card.evaluate(element=>document.activeElement===element),true,`${id} did not restore focus`);
  }
  const first=page.locator('[data-guide-category="getting-started"]');
  await first.focus();await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'A');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('tw-guide-drawer-close')),true);
  await page.keyboard.press('Escape');
  await first.focus();await page.keyboard.press('Space');await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('PASS six Guide drawers, scroll preservation, Escape/overlay/close, focus return, keyboard, 1440/390.');
}finally{await browser.close();}
