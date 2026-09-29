import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base=process.env.BASE_URL||'http://127.0.0.1:5188';
const routes=['overview','agents','tokens','market','trading','wallet','leaderboard','payroll','how'];
const browser=await chromium.launch({headless:true});
try{
  for(const width of [1440,390]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    for(const route of routes){
      await page.goto(`${base}/#/${route}`);
      await page.locator('.tw-header').waitFor({state:'attached'});
      await page.waitForTimeout(150);
      const body=await page.locator('body').innerText();
      assert.match(body,/TEKKTEAM/i,`${route} brand at ${width}px`);
      assert.doesNotMatch(body,/TEKKWORK|TEKK WORK/i,`${route} old brand at ${width}px`);
      assert.match(await page.title(),/^TEKKTEAM\b/,`${route} title at ${width}px`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${route} overflow at ${width}px`);
    }
    await page.goto(`${base}/#/overview`);
    const wallet=page.locator('#tw-wallet');
    if(await wallet.isVisible()){
      await wallet.click();
      assert.doesNotMatch(await page.locator('body').innerText(),/TEKKWORK|TEKK WORK/i);
    }
    assert.deepEqual(errors,[],`Page errors at ${width}px`);
    await page.close();
  }
  console.log('TEKKTEAM brand: nine workspace routes and Connect Wallet at 1440/390 passed.');
}finally{await browser.close();}
