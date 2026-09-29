import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publicConfig} from '../server/config.js';
import {renderAgentOverview} from '../public/app/agent-overview-ui.js';

const base=process.env.BASE_URL||'http://127.0.0.1:5188',owner='fixture-owner';
const agent={id:'overview-visual-fixture',no:5,name:'Overview test',creator:owner,createdAt:Date.now(),character:'frank',strategy:'balanced',status:'DRAFT',coin:{name:'Fixture',ticker:'FIX'}};
const point=Date.now()-600000;
const analytics={agentId:agent.id,summary:{portfolioValueSol:.099555,totalPnlSol:-.000445,unrealizedPnlSol:0,roiPercent:-.44,paperStartingCapitalSol:.1},portfolioHistory:[{timestamp:point,portfolioValueSol:.1},{timestamp:point+300000,portfolioValueSol:.0998},{timestamp:point+600000,portfolioValueSol:.099555}],decisionFunnel:{marketsEvaluated:25}};
const decision={market:{symbol:'SIDEKINU',priceUsd:.00045,liquidityUsd:62000,volume5m:54000,change5m:14.6,buys5m:30,sells5m:9},finalDecision:'SKIPPED',reason:{code:'ENTRY_FILTERS_NOT_MET',summary:'Momentum below the entry threshold.'},signalChecks:[{key:'liquidityPassed',passed:true,actual:62000,minimum:15000},{key:'volumePassed',passed:true,actual:54000,minimum:750},{key:'momentumPassed',passed:false,actual:.3,minimum:.75},{key:'ratioPassed',passed:true,actual:3.3,minimum:1.25}]};
const trading={agentId:agent.id,status:'PAUSED',strategy:'balanced',lastUpdated:Date.now()-12000,openPositions:[],activity:[{timestamp:Date.now()-12000,type:'PAUSED',reason:'Paused by owner'},{timestamp:Date.now()-500000,type:'SIGNAL_SKIPPED',tokenSymbol:'SIDEKINU',reason:'Entry threshold not met'}]};
const position={tokenSymbol:'SIDEKINU',entryPriceUsd:.1,currentPriceUsd:.11,marketValueSol:.0011,pnlSol:.0001,pnlPercent:10,openedAt:Date.now()-120000,takeProfitPercent:8,stopLossPercent:4};
const openWhilePaused=renderAgentOverview({t:{...trading,openPositions:[position]},a:analytics,d:decision});
assert.match(openWhilePaused,/AGENT STATUS/);assert.match(openWhilePaused,/CURRENT POSITION/);assert.match(openWhilePaused,/PAUSED · POSITION OPEN/);assert.match(openWhilePaused,/Scanner paused\. Position monitoring continues\./);assert.equal((openWhilePaused.match(/class="aw-performance-value"/g)||[]).length,1,'Portfolio value has one presentation');assert.equal((openWhilePaused.match(/tw-overview-panel/g)||[]).length,2,'Only Position and Performance are filled surfaces');
assert.match(renderAgentOverview({t:{...trading,status:'WORKING'},a:analytics,d:decision}),/Scanning markets for an entry/);
assert.match(renderAgentOverview({t:trading,a:analytics,d:null}),/NO OPEN POSITION/,'No-position state keeps the shared grid without fabricated holdings');
assert.match(renderAgentOverview({t:null,a:null,d:null}),/Agent state unavailable/,'Unavailable state never claims scanning');
assert.match(renderAgentOverview({t:{...trading,openPositions:[{...position,tokenName:'Orbit',tokenSymbol:'o'}]},a:analytics,d:decision}),/>Orbit<\/h3>/,'Ambiguous one-letter symbol is not shown beside the known name');
assert.match(renderAgentOverview({t:{...trading,tokenMint:'mint-one',tokenName:'Orbit',openPositions:[{...position,tokenMint:'mint-one',tokenSymbol:'o'}]},a:analytics,d:decision}),/>Orbit<\/h3>/,'Existing agent token name is used only for the matching position mint');
assert.doesNotMatch(renderAgentOverview({t:{...trading,tokenMint:'mint-other',tokenName:'Wrong token',openPositions:[{...position,tokenMint:'mint-one',tokenSymbol:'o'}]},a:analytics,d:decision}),/Wrong token · o/,'Another mint cannot supply a position identity');
assert.match(renderAgentOverview({t:trading,a:analytics,d:null}),/RECENT ACTIVITY/);
const tinyLoss=renderAgentOverview({t:trading,a:{...analytics,summary:{...analytics.summary,totalPnlSol:-.000011}},d:decision});assert.match(tinyLoss,/-0\.000011 SOL/);assert.doesNotMatch(tinyLoss,/-0 SOL/);
const gapped={...analytics,portfolioHistory:[{timestamp:point,portfolioValueSol:.1},{timestamp:point+300000,portfolioValueSol:.0998},{timestamp:point+600000,portfolioValueSol:null},{timestamp:point+900000,portfolioValueSol:.0995},{timestamp:point+1200000,portfolioValueSol:.0994}]};
assert.equal((renderAgentOverview({t:trading,a:gapped,d:decision}).match(/class="ao-line"/g)||[]).length,2,'Missing snapshots remain disconnected');
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),writes=[],errors=[];let tradingStatus='PAUSED',open=false,currentAnalytics=analytics;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(route.request().method()!=='GET'){writes.push(path);if(path.endsWith('/trading/enable')){tradingStatus='WORKING';return route.fulfill({json:{...trading,status:'WORKING'}});}return route.abort();}
   if(path==='/api/state')return route.fulfill({json:{config:publicConfig('devnet'),session:{address:owner},agents:[agent],events:[],coins:[],feed:[],tokens:[],bonded:[],stats:{}}});
   if(path==='/api/agents/'+agent.id)return route.fulfill({json:agent});
   if(path==='/api/trading/network')return route.fulfill({json:{agents:[],overview:{activeTraders:0,totalPaperPnlSol:0},activity:[]}});
   if(path==='/api/trading/leaderboard')return route.fulfill({json:{agents:[]}});
   if(path==='/api/trading/payroll')return route.fulfill({json:{agents:[]}});
   if(path.endsWith('/trading'))return route.fulfill({json:{...trading,status:tradingStatus,openPositions:open?[position]:[]}});
   if(path.endsWith('/trading/strategy-config'))return route.fulfill({json:{agentId:agent.id,config:{strategy:'balanced'}}});
   if(path.endsWith('/analytics'))return route.fulfill({json:currentAnalytics});
   if(path.includes('/trading/decisions'))return route.fulfill({json:{agentId:agent.id,decisions:[decision]}});
   return route.fulfill({status:404,json:{error:'Fixture only'}});
  });
  let homeSurface=null;
  if(width===1440){await page.goto(base+'/#/overview');await page.locator('.ov-dashboard .tw-overview-top-grid>.tw-overview-panel').first().waitFor();homeSurface=await page.locator('.ov-dashboard .tw-overview-top-grid>.tw-overview-panel').first().evaluate(node=>({background:getComputedStyle(node).backgroundImage,border:getComputedStyle(node).borderColor,radius:getComputedStyle(node).borderRadius}));}
  if(width===1440&&process.env.OVERVIEW_SCREENSHOTS){for(const route of ['overview','agents','tokens','payroll']){await page.goto(base+'/#/'+route);await page.locator('#tw-page').waitFor();await page.screenshot({path:join(tmpdir(),`tekkwork-overview-reference-${route}-1440.png`),fullPage:true});}}
  await page.goto(base+'/#/agent/'+agent.id);await page.locator('.ao-overview').waitFor();
  assert.equal(await page.locator('.aw-status').count(),1);
  assert.equal(await page.locator('.aw-performance').count(),1);
  assert.equal(await page.locator('.aw-position').count(),1,'No-position state keeps the same two-panel grid');
  assert.match(await page.locator('.aw-position').innerText(),/NO OPEN POSITION/);
  assert.equal(await page.locator('.aw-performance-pnl').count(),1,'ROI is shown with portfolio; PnL is not duplicated');
  assert.equal(await page.locator('.ao-sparkline').count(),1);
  assert.equal(await page.locator('.aw-grid').count(),4);
  assert.equal(await page.locator('.aw-activity-list li').count(),2);
  assert.equal(await page.locator('[data-overview-range]').count(),0,'Compact Overview has no permanent chart range controls');
  const signature=()=>page.evaluate(()=>{const panel=document.querySelector('.aw-performance'),p=getComputedStyle(panel),chart=panel.querySelector('.aw-chart');return {width:panel.getBoundingClientRect().width,height:panel.getBoundingClientRect().height,padding:p.padding,background:p.backgroundImage,border:p.borderColor,radius:p.borderRadius,chartHeight:chart.getBoundingClientRect().height};});
  const before=await signature();if(homeSurface)assert.deepEqual({background:before.background,border:before.border,radius:before.radius},homeSurface,'Agent Performance uses the actual Home panel material');const chartType=await page.locator('.ao-sparkline').evaluate(svg=>({width:svg.viewBox.baseVal.width,preserve:svg.getAttribute('preserveAspectRatio'),axisSize:getComputedStyle(svg.querySelector('.aw-axis')).fontSize}));assert.equal(chartType.width,360);assert.equal(chartType.preserve,'xMidYMid meet');assert.ok(parseFloat(chartType.axisSize)<=14);
  const svg=page.locator('.ao-sparkline'),chartPoint=page.locator('[data-ao-sample]').first();await svg.scrollIntoViewIfNeeded();const box=await svg.boundingBox();
  const chartWidth=await svg.evaluate(node=>node.viewBox.baseVal.width);await page.mouse.move(box.x+box.width*Number(await chartPoint.getAttribute('data-x'))/chartWidth,box.y+box.height*Number(await chartPoint.getAttribute('data-y'))/280);
  assert.equal(await page.locator('.ao-chart-tooltip').isVisible(),true,`Chart tooltip visible at ${width}px; errors ${errors.join(', ')}`);assert.match(await page.locator('.ao-chart-tooltip').innerText(),/PnL.*ROI/);
  assert.equal(await page.locator('[data-hero-trading]').textContent().then(x=>x.includes('START AI AGENT')),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`Overview overflow at ${width}`);
  assert.equal(await page.locator('.ao-reason-drawer').count(),0,'Reasoning belongs in Trading or Activity');
  if(process.env.OVERVIEW_SCREENSHOTS)await page.screenshot({path:join(tmpdir(),`tekkwork-overview-${width}.png`),fullPage:true});
  open=true;await page.reload();await page.locator('.aw-position-pnl').waitFor();assert.match(await page.locator('.aw-status').innerText(),/PAUSED · POSITION OPEN/);assert.match(await page.locator('.ad-hero-role').innerText(),/PAUSED · POSITION OPEN/);assert.deepEqual(await signature(),before,'Position arrival must not change Performance geometry or material');
  const layout=await page.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect(),style=s=>getComputedStyle(document.querySelector(s)),status=rect('.aw-status'),grid=rect('.aw-primary-grid'),position=rect('.aw-position'),performance=rect('.aw-performance'),activity=rect('.aw-activity');return {columns:style('.aw-primary-grid').gridTemplateColumns.split(' ').length,gutter:parseFloat(style('.aw-primary-grid').columnGap),firstGap:grid.top-status.bottom,secondGap:activity.top-grid.bottom,padding:parseFloat(style('.aw-position').paddingLeft),positionWidth:position.width,performanceWidth:performance.width,stacked:performance.top>position.bottom-1,surfaces:document.querySelectorAll('.tw-overview-panel').length,rootWidth:rect('.aw-overview').width,pageWidth:rect('#tw-page').width};});
  assert.equal(layout.surfaces,2);assert.ok(layout.rootWidth<=layout.pageWidth+1);assert.ok(Math.abs(layout.firstGap-48)<1.5);assert.ok(Math.abs(layout.secondGap-48)<1.5);assert.equal(layout.padding,24);
  if(width===1440){assert.equal(layout.columns,12);assert.equal(layout.gutter,24);assert.equal(layout.stacked,false);assert.ok(layout.positionWidth>layout.performanceWidth*1.8&&layout.positionWidth<layout.performanceWidth*2.2,'Desktop Position/Performance uses 8/4 grid spans');}
  else{assert.equal(layout.stacked,true);assert.ok(Math.abs(layout.positionWidth-layout.performanceWidth)<1,'Mobile surfaces share one width');}
  if(process.env.OVERVIEW_SCREENSHOTS)await page.screenshot({path:join(tmpdir(),`tekkwork-overview-position-${width}.png`),fullPage:true});
  for(const [name,status,hasPosition,data] of [['running-scanning','WORKING',false,analytics],['position-open','WORKING',true,analytics],['attention','ERROR',false,analytics],['positive','PAUSED',true,{...analytics,summary:{...analytics.summary,roiPercent:.27,totalPnlSol:.000268},portfolioHistory:[{timestamp:point,portfolioValueSol:.1},{timestamp:point+600000,portfolioValueSol:.100268}]}],['flat','PAUSED',false,{...analytics,summary:{...analytics.summary,portfolioValueSol:.1,roiPercent:0,totalPnlSol:0},portfolioHistory:[{timestamp:point,portfolioValueSol:.1},{timestamp:point+600000,portfolioValueSol:.1}]}],['no-samples','PAUSED',false,{...analytics,portfolioHistory:[]}]]){
   tradingStatus=status;open=hasPosition;currentAnalytics=data;await page.reload();await page.locator('.aw-performance').waitFor();assert.deepEqual(await signature(),before,`${name} must keep the accepted Performance system`);if(await page.locator('.ao-sparkline').count())assert.deepEqual(await page.locator('.ao-sparkline').evaluate(svg=>({width:svg.viewBox.baseVal.width,preserve:svg.getAttribute('preserveAspectRatio'),axisSize:getComputedStyle(svg.querySelector('.aw-axis')).fontSize})),chartType,`${name} must keep chart typography and dimensions`);if(name==='running-scanning')assert.match(await page.locator('.aw-status').innerText(),/RUNNING/);if(process.env.OVERVIEW_SCREENSHOTS)await page.screenshot({path:join(tmpdir(),`tekkwork-overview-${name}-${width}.png`),fullPage:true});
  }
  tradingStatus='PAUSED';open=false;currentAnalytics=analytics;await page.reload();await page.locator('.aw-chart').waitFor();
  await page.locator('[data-overview-action="activity"]').click();assert.equal(await page.locator('[data-agent-panel]').getAttribute('data-agent-panel'),'activity');
  await page.locator('[data-hero-trading]').click();await page.waitForFunction(()=>document.querySelector('.ad-hero-role .tw-status')?.textContent==='SCANNING MARKETS');
  assert.deepEqual(writes,['/api/agents/'+agent.id+'/trading/enable'],'Hero action reuses one existing Paper enable request');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Agent Overview strict desktop/mobile grid, Paper snapshot, chart, hero state and navigation passed.');
}finally{await browser.close();}
