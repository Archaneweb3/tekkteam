import {chromium} from 'playwright';
import {createServer} from '../server/app.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';

const base=process.env.BASE_URL||'http://127.0.0.1:5188';
const dir=mkdtempSync(join(tmpdir(),'tekkwork-market-test-'));
const service=createServer({dbPath:join(dir,'db.sqlite'),origins:[base],network:'local'});
const server=service.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const backend=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.route('**/api/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:backend+url.pathname,headers:{...route.request().headers(),origin:base}});await route.fulfill({response});});
  await page.goto(base+'/#/market');
  await page.locator('#tw-page').waitFor();
  await page.locator('.tw-world-market').waitFor();
  assert.equal(await page.locator('.tw-header [data-nav="market"]').count(),1);
  assert.equal(await page.locator('.tw-header [data-nav="skins"]').count(),0);
  assert.match(await page.locator('.tw-header [data-nav="market"] img').getAttribute('src'),/market\.webp$/);
  await page.evaluate(async()=>{
   const {mountMarketPage}=await import('/app/market-page.js');
   const observedAt=Date.now();
   const opportunities=[{market:{mint:'MintOne',symbol:'SIDEKINU',name:'Sidekinu',priceUsd:0.000459,change5m:14.62,liquidityUsd:62200,volume5m:54300,buys5m:14,sells5m:10,observedAt,source:'Dexscreener',executionSupport:'SUPPORTED'},finalDecision:'BUY',reason:{summary:'Momentum conditions passed'}},{market:{mint:'MintTwo',symbol:'PUMPFREE',name:'Pumpfree',priceUsd:null,change5m:null,liquidityUsd:1400,volume5m:null,buys5m:null,sells5m:null,observedAt,source:'Dexscreener',executionSupport:'UNSUPPORTED'},finalDecision:'SKIPPED',reason:{summary:'Momentum below threshold'}}];
   window.marketFixture=mountMarketPage(document.querySelector('#tw-page'),{owner:'fixture-owner',agents:[{id:'agent-1',creator:'fixture-owner',name:'lpad test'}],read:async()=>({agentId:'agent-1',status:'WATCHING',freshnessMs:30000,lastChecked:observedAt,opportunities})});
  });
  await page.locator('.market-feed-row').first().waitFor();
  assert.equal(await page.locator('.market-feed-row').count(),2);
  assert.match(await page.locator('.market-metrics').textContent(),/MARKETS SHOWN2/);
  assert.equal(await page.getByText('SIDEKINU').count()>0,true);
  assert.equal(await page.locator('.market-feed-row').nth(1).getByText('—').count()>0,true);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`${width}px horizontal overflow`);
  if(width===1440){const feed=await page.locator('.market-feed').boundingBox(),side=await page.locator('.market-side').boundingBox();assert.ok(feed.width>side.width);}
  await page.locator('.market-feed-row').first().click();await page.locator('.market-detail-dialog[open]').waitFor();
  const dialog=await page.locator('.market-detail-dialog').boundingBox();
  if(width===390)assert.ok(dialog.width<=390&&dialog.y>0,'mobile detail is bottom sheet');
  await page.keyboard.press('Escape');await page.locator('.market-detail-dialog[open]').waitFor({state:'hidden'});
  await page.locator('.market-search input').fill('Pumpfree');assert.equal(await page.locator('.market-feed-row').count(),1);
  if(width===390){
   await page.evaluate(async()=>{window.marketFixture.destroy();const {mountMarketPage}=await import('/app/market-page.js');window.marketFixture=mountMarketPage(document.querySelector('#tw-page'),{owner:'fixture-owner',agents:[{id:'agent-1',creator:'fixture-owner',name:'lpad test'}],read:async()=>{throw Error('secret RPC diagnostic');}});});
   await page.getByText('MARKET DATA TEMPORARILY UNAVAILABLE').waitFor();
   assert.equal(await page.getByText('secret RPC diagnostic').count(),0);
  }
  await page.close();
 }
 console.log('Market fixture passed at 1440px and 390px.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));service.close();rmSync(dir,{recursive:true,force:true});}
