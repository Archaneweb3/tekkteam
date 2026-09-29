import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publicConfig} from '../server/config.js';

const base=process.env.BASE_URL||'http://127.0.0.1:5188',now=Date.now(),agent={id:'activity-visual-fixture',no:5,name:'Activity test',creator:'fixture-owner',createdAt:now,character:'frank',strategy:'balanced',status:'DRAFT',coin:{name:'Fixture',ticker:'FIX'}};
const activity=[{eventId:'close',timestamp:now-40000,type:'POSITION_CLOSED',tokenSymbol:'SIDEKINU',positionId:'position-1',reason:'Stop Loss triggered',pnlSol:-.000246,pnlPercent:-24.41},{eventId:'sell',timestamp:now-42000,type:'SELL',tokenSymbol:'SIDEKINU',positionId:'position-1',reason:'Stop Loss triggered',exitPrice:.08,executedSizeSol:.0008},{eventId:'buy',timestamp:now-100000,type:'BUY',tokenSymbol:'SIDEKINU',positionId:'position-1',reason:'Momentum conditions passed',entryPrice:.1,executedSizeSol:.001},{eventId:'pause',timestamp:now-120000,type:'PAUSED',reason:'Paused by owner'}];
const decision={id:'decision-1',timestamp:now-60000,market:{symbol:'NEARCAT',priceUsd:.00042,liquidityUsd:42000,volume5m:2400,change5m:0,buys5m:20,sells5m:5},strategy:'balanced',configVersion:2,finalDecision:'SKIPPED',reason:{code:'ENTRY_FILTERS_NOT_MET',summary:'Momentum below entry threshold'},signalChecks:[{key:'liquidityPassed',passed:true,actual:42000,minimum:15000},{key:'volumePassed',passed:true,actual:2400,minimum:750},{key:'momentumPassed',passed:false,actual:0,minimum:.75},{key:'ratioPassed',passed:true,actual:4,minimum:1.25}]};
const trading={agentId:agent.id,status:'PAUSED',strategy:'balanced',activity,openPositions:[]},decisions={agentId:agent.id,decisions:[decision]},analytics={agentId:agent.id,tradeHistory:[{positionId:'position-1',tokenSymbol:'SIDEKINU',entryPriceUsd:.1,exitPriceUsd:.08,sizeSol:.001,pnlSol:-.000246,returnPercent:-24.41,holdingMs:60000}]};
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),writes=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(route.request().method()!=='GET'){writes.push(path);return route.abort();}
   if(path==='/api/state')return route.fulfill({json:{config:publicConfig('devnet'),session:{address:agent.creator},agents:[agent],events:[],coins:[],feed:[],tokens:[],bonded:[],stats:{}}});
   if(path==='/api/agents/'+agent.id)return route.fulfill({json:agent});
   if(path.endsWith('/trading'))return route.fulfill({json:trading});
   if(path.includes('/trading/decisions'))return route.fulfill({json:decisions});
   if(path.endsWith('/analytics'))return route.fulfill({json:analytics});
   return route.fulfill({status:404,json:{error:'Fixture only'}});
  });
  if(width===1440&&process.env.ACTIVITY_SCREENSHOTS){await page.goto(base+'/#/overview');await page.screenshot({path:join(tmpdir(),'tekkwork-activity-home-1440.png'),fullPage:true});}
  await page.goto(base+'/#/agent/'+agent.id);await page.getByRole('tab',{name:'Activity'}).click();await page.locator('.aa-timeline .aa-item').first().waitFor();
  const joined=await page.evaluate(async({trading,decisions,analytics})=>{const {activityRows}=await import('/app/agent-activity-ui.js');return activityRows(trading,decisions,analytics);},{trading,decisions,analytics});assert.equal(joined.length,5);assert.equal(joined.filter(r=>r.group===1).length,3);assert.equal(joined[0].trade?.positionId,'position-1');
  const projection=await page.evaluate(async({trading,decisions,analytics,now})=>{const {activityRows}=await import('/app/agent-activity-ui.js');const repeated={...decisions,decisions:[...decisions.decisions,{...decisions.decisions[0],id:'decision-2',timestamp:now-61000}]};const noisy={...trading,activity:[...trading.activity,{eventId:'poll',timestamp:now-65000,type:'HEARTBEAT'}]};const result=activityRows(noisy,repeated,analytics);return {length:result.length,repeats:result.find(r=>r.id==='decision:decision-1')?.sourceEvents.length,heartbeats:result.filter(r=>r.type==='HEARTBEAT').length,trades:result.filter(r=>r.kind==='TRADES').length};},{trading,decisions,analytics,now});assert.deepEqual(projection,{length:5,repeats:2,heartbeats:0,trades:3},'Only equivalent non-material decisions collapse; underlying records and trade events remain');
  assert.equal(await page.locator('.aa-summary').count(),1);
  assert.equal(await page.locator('.aa-summary .network-stat-icon').count(),0);
  assert.equal(await page.locator('.aa-header h2').textContent(),'ACTIVITY');
  assert.equal(await page.locator('.aa-header p').textContent(),'Everything your Agent has been doing.');
  assert.equal(await page.locator('.aa-event.tw-feed-row').count(),5);
  assert.equal(await page.locator('.aa-item').count(),5);
  assert.equal(await page.locator('.aa-date').count(),1);
  assert.equal(await page.locator('.aa-work-panel .aa-event-desc').count(),5);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`Activity overflow at ${width}`);
  if(process.env.ACTIVITY_SCREENSHOTS)await page.screenshot({path:join(tmpdir(),`tekkwork-activity-${width}.png`),fullPage:true});
  await page.locator('.aa-closed .aa-event').click();assert.equal(await page.locator('.aa-drawer').evaluate(el=>el.open),true);assert.match(await page.locator('.aa-detail-pnl').textContent(),/-24.41%/);await page.keyboard.press('Escape');
  await page.locator('[data-activity-filter="DECISIONS"]').click();assert.equal(await page.locator('.aa-item').count(),1);
  await page.locator('.aa-item .aa-event').click();assert.match(await page.locator('.aa-drawer').textContent(),/ENTRY CHECKS/);await page.keyboard.press('Escape');
  await page.locator('[data-activity-search]').fill('no matching token');assert.equal(await page.locator('.aa-empty').count(),1);
  for(let i=0;i<22;i++)activity.push({eventId:'system-'+i,timestamp:now-200000-i*1000,type:'PAUSED',reason:'Paused by owner'});
  await page.getByRole('tab',{name:'Overview'}).click();await page.getByRole('tab',{name:'Activity'}).click();await page.locator('.aa-item').first().waitFor();
  assert.equal(await page.locator('.aa-item').count(),20,'Initial event batch is bounded');
  await page.locator('[data-activity-more]').click();assert.equal(await page.locator('.aa-item').count(),27,'Load more reveals remaining existing events');
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);await page.close();activity.splice(4);
 }
 console.log('Agent Activity desktop/mobile timeline, grouping, drawer, filters, search and empty state passed.');
}finally{await browser.close();}
