import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publicConfig} from '../server/config.js';
import {analyticsFixture} from './analytics-fixture-data.mjs';

const base=process.env.BASE_URL||'http://127.0.0.1:5188',fixture=analyticsFixture();
const owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
const agent={...fixture.agent,no:5,creator:owner,createdAt:Date.now(),character:'cupsey',status:'DRAFT',coin:{name:'Nora Token',ticker:'NORA'}};
const analytics={...fixture.populated,agentId:agent.id};
const browser=await chromium.launch();
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{
   if(route.request().method()!=='GET'){writes.push(route.request().url());return route.abort();}
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/state')return route.fulfill({json:{config:publicConfig('devnet'),session:{address:owner},agents:[agent],events:[],stats:{}}});
   if(path==='/api/agents/'+agent.id)return route.fulfill({json:agent});
   if(path==='/api/agents/'+agent.id+'/analytics')return route.fulfill({json:analytics});
   if(path.endsWith('/deletion-eligibility'))return route.fulfill({json:{agentId:agent.id,canDelete:false,launchState:'launched'}});
   return route.fulfill({status:404,json:{error:'Unavailable in isolated visual fixture'}});
  });
  await page.goto(base+'/#/agent/'+agent.id);
  await page.getByRole('button',{name:'Performance',exact:true}).click();
  await page.locator('.ap-chart .ap-line').first().waitFor();
  assert.equal(await page.locator('.ap-performance.ap-clean').count(),1);
  assert.equal(await page.locator('.ap-summary-rail > div').count(),4);
  assert.equal(await page.locator('.ap-outcomes > section').count(),2);
  assert.equal(await page.locator('.ap-header h2').textContent(),'PERFORMANCE');
  assert.equal(await page.locator('.ap-details').evaluate(el=>el.open),false);
  assert.equal(await page.locator('.ap-results li').count(),Math.min(6,analytics.tradeHistory.length));
  assert.equal(await page.locator('.ap-range button[aria-pressed="true"]').count(),1);
  const gapCheck=await page.evaluate(async({agent,analytics})=>{const {renderAgentPerformance}=await import('/app/agent-performance-ui.js');const start=analytics.portfolioHistory[0].timestamp;const gap={...analytics,portfolioHistory:[{timestamp:start,portfolioValueSol:.1},{timestamp:start+300000,portfolioValueSol:.101},{timestamp:start+600000,portfolioValueSol:null},{timestamp:start+900000,portfolioValueSol:.099},{timestamp:start+1200000,portfolioValueSol:.098}]};const sparse={...analytics,portfolioHistory:[{timestamp:start,portfolioValueSol:.1}]};const empty={...analytics,tradeHistory:[],summary:{...analytics.summary,closedPositionCount:0},strategyPerformance:[]};const positive={...analytics,summary:{...analytics.summary,totalPnlSol:.01,roiPercent:10}};const negative={...analytics,summary:{...analytics.summary,totalPnlSol:-.01,roiPercent:-10}};return {lines:(renderAgentPerformance(agent,gap).html.match(/class="ap-line"/g)||[]).length,rangeDisabled:/data-chart-range="D"[^>]*disabled/.test(renderAgentPerformance(agent,sparse).html),empty:/NO CLOSED TRADES YET/.test(renderAgentPerformance(agent,empty).html),positive:/ap-pnl-primary[\s\S]*class="positive"/.test(renderAgentPerformance(agent,positive).html),negative:/ap-pnl-primary[\s\S]*class="negative"/.test(renderAgentPerformance(agent,negative).html)};},{agent,analytics});
  assert.deepEqual(gapCheck,{lines:2,rangeDisabled:true,empty:true,positive:true,negative:true},'Recorded gaps, empty state, sign states and unsupported ranges remain truthful');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`Performance horizontal overflow at ${width}`);
  if(process.env.PERFORMANCE_SCREENSHOTS){await page.screenshot({path:join(tmpdir(),`tekkwork-performance-${width}.png`),fullPage:true});await page.goto(base+'/#/overview');await page.waitForTimeout(500);await page.screenshot({path:join(tmpdir(),`tekkwork-home-${width}.png`),fullPage:true});await page.goto(base+'/#/agent/'+agent.id);await page.getByRole('button',{name:'Performance',exact:true}).click();await page.locator('.ap-chart .ap-line').first().waitFor();}
  await page.locator('.ap-about').first().click();assert.equal(await page.locator('.ap-methodology').evaluate(el=>el.open),true);await page.keyboard.press('Escape');
  await page.locator('.ap-details summary').click();assert.equal(await page.locator('.ap-funnel li').count(),4);
  await page.locator('.ap-results button').first().click();assert.equal(await page.locator('.ap-trade-detail').evaluate(el=>el.open),true);await page.keyboard.press('Escape');
  await page.locator('.ap-sample').first().hover();assert.equal(await page.locator('.ap-tooltip').isVisible(),true);
  await page.locator('[data-view-activity]').click();assert.equal(await page.locator('[data-agent-panel]').getAttribute('data-agent-panel'),'activity');
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('Agent Performance clean composition, desktop/mobile, chart gaps, details, dialogs and Activity navigation passed.');
}finally{await browser.close();}
