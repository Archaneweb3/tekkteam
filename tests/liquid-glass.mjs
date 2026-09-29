// Render-only fixtures: never exercise a wallet provider or send a backend write.
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {publicConfig} from '../server/config.js';
const phase=process.env.GLASS_QA_PHASE||'after',output=`artifacts/liquid-glass/${phase}`;
// Remote font services can stall on reload. Do not block visual evidence forever.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
mkdirSync(output,{recursive:true});
const now=Date.now(),owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
const names=['Felix Builder','Nora Signal','Otto Analyst','Theo Scout','Hugo Director'];
const agents=['frank','cupsey','fomy','alon','satoshi'].map((character,i)=>({id:`glass-${i}`,no:i+1,name:names[i],creator:owner,character,strategy:['balanced','momentum','selective'][i%3],status:'DRAFT',tradingStatus:['WORKING','PAUSED','READY','DRAFT','DRAFT'][i],createdAt:now-i*3600000,description:'Measured paper decisions within configured limits.',coin:{name:names[i].split(' ')[0]+' Token',ticker:['FLX','NORA','OTTO','THEO','HUGO'][i]}}));
const projections=agents.map((a,i)=>({agentId:a.id,name:a.name,character:a.character,createdAt:a.createdAt,launchToken:{name:a.coin.name,symbol:a.coin.ticker},status:a.tradingStatus,strategy:a.strategy,mode:'paper',tokenName:a.coin.name,tokenSymbol:a.coin.ticker,tokenMint:owner,paperStartingCapitalSol:.1,paperCashSol:.095,portfolioValueSol:.104-i*.001,totalPnlSol:.004-i*.001,realizedPnlSol:.002,unrealizedPnlSol:.002,roiPercent:4-i,tradeCount:8-i,winRate:60,wins:3,losses:2,openPositions:[],activity:[],profiles:['balanced','momentum','selective'],wallet:null}));
const events=['BUY','SELL','RISK_REJECTED','SIGNAL_SKIPPED'].map((type,i)=>({eventId:`glass-event-${i}`,agentId:agents[i].id,type,tokenSymbol:'SOL',strategy:agents[i].strategy,executedSizeSol:i<2?.001:null,pnlSol:i===1?.0001:null,pnlPercent:i===1?3.8:null,timestamp:now-i*20000,reason:['Momentum threshold passed.','Position target reached.','Liquidity below configured minimum.','Entry thresholds not met.'][i]}));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),writes=[],errors=[];let empty=false,hold=false,release=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async r=>{
  const path=new URL(r.request().url()).pathname;if(r.request().method()!=='GET'){writes.push(path);return r.abort();}
  if(hold&&path.startsWith('/api/trading/'))await new Promise(resolve=>release.push(resolve));
  let data;
  if(path==='/api/state')data={session:{address:owner},agents:empty?[]:agents,config:publicConfig('devnet'),events:[],stats:{}};
  else if(path==='/api/wallet/mainnet-balance')data={owner,network:'solana:101',lamports:112100000};
  else if(path==='/api/trading/network')data={agents:empty?[]:projections,activity:empty?[]:events,overview:{activeTraders:empty?0:1,openPositions:0,totalPaperPnlSol:empty?0:.01}};
  else if(path==='/api/trading/leaderboard')data={agents:empty?[]:projections};
  else if(path==='/api/trading/payroll')data={agents:empty?[]:projections.slice(0,2)};
  else data={};return r.fulfill({json:data});
 });
 const settled=async()=>{await page.locator('.tw-new-hires').waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('img[data-character]')].every(img=>img.dataset.ready==='true'));await page.waitForTimeout(200);};
 const screenshot=async name=>{await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1500))]));return page.screenshot({path:`${output}/${name}.png`,fullPage:true});};
 const style=async locator=>locator.evaluate(el=>{const s=getComputedStyle(el);return {transform:s.transform,background:s.backgroundColor,border:s.borderColor,outline:s.outlineStyle,opacity:s.opacity,shadow:s.boxShadow};});
 for(const width of [1440,1280,390]){
  await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:5188/#/overview');await settled();
  assert.equal(await page.locator('#tw-office canvas').count(),1);assert.equal(await page.locator('canvas').count(),1,'Only map remains a realtime canvas after thumbnails settle');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await screenshot(`overview-${width}`);
  const timing=await page.evaluate(async()=>{const intervals=[];let start,last;await new Promise(resolve=>{function frame(t){if(start===undefined){start=t;last=t;}else intervals.push(t-last);last=t;scrollTo(0,Math.max(0,document.documentElement.scrollHeight-innerHeight)*(t-start)/1500);if(t-start<1500)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});scrollTo(0,0);intervals.sort((a,b)=>a-b);return {samples:intervals.length,medianMs:intervals[Math.floor(intervals.length*.5)],p95Ms:intervals[Math.floor(intervals.length*.95)],maxMs:intervals.at(-1)};});
  console.log(JSON.stringify({phase,width,frameTimings:timing,note:'Headless software-rendering relative sample; not a hardware FPS guarantee'}));
 }
 if(phase==='before'){assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);console.log('BASELINE complete: isolated fixture, one map canvas, no overflow or writes');}
 else{
  await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:5188/#/overview');await settled();
  const nav=page.locator('.tw-header nav a.active'),hire=page.locator('.glass-hero-actions a.primary');
  const navBefore=await style(nav);await nav.hover();await page.waitForTimeout(220);assert.equal((await style(nav)).background,navBefore.background,'Selected navigation identity remains on hover');
  await page.locator('.tw-header nav a:not(.active)').first().hover();await page.waitForTimeout(220);await page.locator('.tw-header').screenshot({path:`${output}/sidebar-default-hover.png`});
  assert.equal(await hire.count(),1,'Actual hero primary action is present');{
   const normal=await style(hire);await hire.hover();await page.waitForTimeout(220);const hover=await style(hire);await screenshot('primary-hover');
   await page.mouse.down();await page.waitForTimeout(220);const pressed=await style(hire);await screenshot('primary-pressed');await page.mouse.move(0,0);await page.mouse.up();
   assert.notEqual(pressed.transform,hover.transform,'Pressed primary action must compress rather than retain its hover lift');
   console.log(JSON.stringify({primary:{normal,hover,pressed}}));
   await page.keyboard.press('Tab');await hire.focus();assert.notEqual((await style(hire)).outline,'none');await screenshot('focus');
  }
  const buys=page.locator('[data-feed-filter=buys]');await buys.click();assert.equal(await buys.getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.tw-feed-row').count(),1);await page.locator('.tw-feed-row').hover();await screenshot('trading-selected-hover');await page.locator('[data-feed-filter=all]').click();
  await page.locator('[data-sort=pnl]').click();await page.waitForFunction(()=>document.querySelector('[data-sort=pnl]')?.getAttribute('aria-pressed')==='true');await page.locator('.tw-podium-rank-1').hover();await page.locator('.tw-employee').screenshot({path:`${output}/employee-selected-hover.png`});
  await page.locator('.tw-new-hire-list a').first().hover();await screenshot('new-hire-hover');await page.locator('.ov-payroll-card').first().hover();await screenshot('payroll-hover');
  await page.locator('#tw-wallet').click();await page.locator('.tw-wallet-popover').waitFor();await screenshot('wallet');await page.locator('#tw-wallet').click();
  // Render primitive states in the existing controls; DOM-only, no product requests.
  await buys.evaluate(el=>{el.classList.add('tw-button');el.disabled=true;});await screenshot('disabled');assert.equal((await style(buys)).transform,'none');await buys.evaluate(el=>{el.disabled=false;el.setAttribute('aria-busy','true');});await screenshot('loading-control');await buys.evaluate(el=>el.removeAttribute('aria-busy'));
  await page.setViewportSize({width:390,height:1000});await page.goto('http://127.0.0.1:5188/#/overview');await settled();
  const menu=page.locator('[aria-controls="tw-workspace-navigation"]');if(await menu.count()){await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');await page.waitForTimeout(240);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Open drawer must not cause horizontal overflow');await screenshot('drawer-open-390');await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');}else throw Error('Mobile drawer toggle not found; align QA selector with shell contract');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.tw-button').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');await screenshot('reduced-motion-390');
  empty=true;await page.goto('http://127.0.0.1:5188/#/overview');await page.locator('.tw-overview-empty').first().waitFor();await screenshot('empty-390');
  hold=true;await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Loading Paper network…',{exact:true}).waitFor();await screenshot('loading-network-390');hold=false;for(const done of release)done();release=[];
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);console.log('PASS interactions, fixtures, drawer, reduced motion; no API writes or wallet requests');
 }
}finally{await browser.close();}
