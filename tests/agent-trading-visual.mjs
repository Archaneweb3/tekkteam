import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publicConfig} from '../server/config.js';
import {renderAgentTrading} from '../public/app/agent-trading-ui.js';

const base=process.env.BASE_URL||'http://127.0.0.1:5188';
const agent={id:'trading-visual-fixture',name:'Visual test agent',creator:'fixture-owner',createdAt:Date.now(),character:'frank',strategy:'balanced',status:'DRAFT',coin:{name:'Fixture',ticker:'FIX'}};
const config={strategy:'balanced',signal:{minLiquidityUsd:15000,minVolume5mUsd:750,minPriceChange5mPercent:.75},risk:{maxSolPerTrade:.001,maxPositionPercent:10,maxDailySpendSol:.02,maxOpenPositions:1},execution:{maxSlippageBps:100,cooldownSeconds:60},position:{stopLossPercent:3.5,takeProfitPercent:6}};
const decision={timestamp:Date.now(),market:{symbol:'SIDEKINU',name:'Sidekinu',priceUsd:.000459,liquidityUsd:62200,volume5m:54300,change5m:14.62,buys5m:30,sells5m:9},strategy:'balanced',configVersion:2,finalDecision:'SKIPPED',reason:{code:'ENTRY_FILTERS_NOT_MET',summary:'Momentum below the current entry threshold.'},signalChecks:[{key:'liquidityPassed',passed:true,actual:62200,minimum:15000},{key:'volumePassed',passed:true,actual:54300,minimum:750},{key:'momentumPassed',passed:false,actual:.3,minimum:.75},{key:'ratioPassed',passed:true,actual:3.3,minimum:1.25}]};
for(const state of ['PAUSED','WORKING'])for(const hasPosition of [false,true]){
 const html=renderAgentTrading({agent,t:{status:state,openPositions:hasPosition?[{tokenSymbol:'SIDEKINU'}]:[]},r:{opportunities:[]},d:decision,config});
 assert.match(html,hasPosition?/POSITION OPEN/:state==='WORKING'?/SCANNING/:/PAUSED/);
 assert.match(html,/data-paper-action/);assert.match(html,/TRADING PLAN/);
 assert.doesNotMatch(html,/AGENT OPERATIONS|SCANNER PAUSED<\/h3>|at-profile-grid|at-position-layout/);
}
const many=Array.from({length:8},(_,i)=>({...decision,market:i===1?{}:{...decision.market,symbol:'TOKEN'+i}}));
const condensed=renderAgentTrading({agent,t:{status:'WORKING'},r:{opportunities:many},d:null,config});
assert.equal((condensed.match(/class="at-radar-row"/g)||[]).length,5);
assert.match(condensed,/data-reason-index="2"/);assert.doesNotMatch(condensed,/Unknown market/);
assert.match(condensed,/No decision yet/);assert.equal((condensed.match(/data-paper-action/g)||[]).length,1);
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;
   if(path==='/api/state')return route.fulfill({json:{config:publicConfig('devnet'),session:{address:agent.creator},agents:[agent],events:[],coins:[],feed:[],tokens:[],bonded:[],stats:{}}});
   if(path==='/api/agents/'+agent.id)return route.fulfill({json:agent});
   if(path.endsWith('/trading'))return route.fulfill({json:{agentId:agent.id,status:'WORKING',strategy:'balanced',paperStartingCapitalSol:.1,lastUpdated:Date.now(),activity:[],openPositions:[]}});
   if(path.endsWith('/trading/radar'))return route.fulfill({json:{agentId:agent.id,status:'WORKING',counts:{scanned:25,eligible:8},opportunities:[decision]}});
   if(path.includes('/trading/decisions'))return route.fulfill({json:{agentId:agent.id,decisions:[decision]}});
   if(path.endsWith('/trading/strategy-config'))return route.fulfill({json:{agentId:agent.id,config,version:2}});
   return route.fulfill({status:404,json:{error:'Fixture only'}});
  });
  if(width===1440&&process.env.AGENT_TRADING_SCREENSHOTS){await page.goto(base+'/#/overview');await page.screenshot({path:join(tmpdir(),'tekkwork-home-reference-1440.png'),fullPage:true});}
  await page.goto(base+'/#/agent/'+agent.id);await page.getByRole('tab',{name:'Trading'}).click();
  await page.locator('.at-status-section').waitFor();
  assert.equal(await page.locator('.at-intro h2').textContent(), 'TRADING');
  assert.equal(await page.locator('.at-plan-rail>div').count(),5);
  assert.equal(await page.locator('.at-plan-rail .network-stat-icon').count(),0);
  assert.equal(await page.locator('[data-paper-action]').textContent().then(x=>x.includes('PAUSE AGENT')),true);
  assert.equal(await page.locator('.at-scanning,.at-position,.at-profile,.at-command').count(),0);
  assert.equal(await page.locator('.at-radar-row').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Overflow at ${width}`);
  await page.locator('[data-reason-latest]').click();assert.equal(await page.locator('.at-drawer').evaluate(el=>el.open),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('.at-drawer').evaluate(el=>el.open),false);
  if(process.env.AGENT_TRADING_SCREENSHOTS)await page.screenshot({path:join(tmpdir(),`tekkwork-trading-${width}.png`),fullPage:true});
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Agent Trading visual desktop/mobile fixture, live data, drawer and Escape passed.');
}finally{await browser.close();}
