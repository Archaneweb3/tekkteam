import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publicConfig} from '../server/config.js';

const base=process.env.BASE_URL||'http://127.0.0.1:5188';
const agent={id:'detail-tabs-fixture',no:1,name:'Fixture Agent',creator:'ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS',createdAt:Date.now(),character:'frank',strategy:'balanced',status:'DRAFT',coin:{name:'Fixture',ticker:'FIX'}};
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/state')return route.fulfill({json:{config:publicConfig('devnet'),session:{address:agent.creator},agents:[agent],events:[],coins:[],feed:[],tokens:[],bonded:[],stats:{}}});
   if(path==='/api/agents/'+agent.id)return route.fulfill({json:agent});
   if(path==='/api/agents/'+agent.id+'/deletion-eligibility')return route.fulfill({json:{agentId:agent.id,canDelete:false,launchState:'launched',reason:'Historical fixture'}});
   if(path==='/api/agents/'+agent.id+'/trading')return route.fulfill({json:{agentId:agent.id,status:'PAUSED',activity:[],openPositions:[],paperCashSol:.1,portfolioValueSol:.1,totalPnlSol:0,roiPercent:0}});
   if(path==='/api/agents/'+agent.id+'/analytics')return route.fulfill({status:503,json:{error:'Analytics fixture unavailable'}});
   if(path==='/api/agents/'+agent.id+'/trading/wallet')return route.fulfill({json:{agentWallet:null,balanceStatus:'NO_WALLET',balanceLamports:null,activity:[],fundingEnabled:false,withdrawalEnabled:false}});
   return route.fulfill({status:404,json:{error:'Unavailable in isolated UI fixture'}});
  });
  await page.goto(base+'/#/agent/'+agent.id);
  await page.locator('.ad-tablist').waitFor();
  assert.equal(await page.locator('[role=tab]').count(),5);
  await page.locator('.aw-status h2').waitFor();
  assert.equal(await page.locator('.ad-mode-badge').count(),1,'One persistent mode badge');
  assert.equal(await page.locator('.aw-performance-value').count(),1,'Portfolio value is shown once as supporting evidence');
  assert.equal(await page.locator('.aw-performance-pnl').count(),1,'PnL is the compact metric beneath portfolio and ROI');
  assert.equal(await page.locator('.ao-help').count(),0,'Overview keeps deep chart controls in Performance');
  if(process.env.AGENT_DETAIL_SCREENSHOTS)await page.screenshot({path:join(tmpdir(),`tekkwork-agent-detail-${width}-overview.png`),fullPage:true});
  assert.equal(await page.locator('.ad-developer').count(),0,'Developer tools should not mount in Overview');
  for(const tab of ['Trading','Performance','Activity','Settings']){
   await page.getByRole('tab',{name:tab}).click();
   assert.equal(await page.locator('[data-agent-panel]').getAttribute('data-agent-panel'),tab.toLowerCase());
   assert.equal(await page.locator('[role=tab][aria-selected=true]').count(),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Agent Detail overflow at ${width}px in ${tab}`);
   if(process.env.AGENT_DETAIL_SCREENSHOTS)await page.screenshot({path:join(tmpdir(),`tekkwork-agent-detail-${width}-${tab.toLowerCase()}.png`),fullPage:true});
  }
  assert.equal(await page.locator('.as-clean-advanced').evaluate(el=>el.open),false);
  assert.equal(await page.locator('[data-controlled]').isVisible(),false);
  assert.equal(await page.locator('.as-clean-section').count(),5,'Settings keeps compact token status, not the launch workflow');
  assert.deepEqual(errors,[],`Browser errors at ${width}px`);
  await page.close();
 }
 console.log('Agent Detail five-tab desktop/mobile fixture passed; developer tools remain collapsed.');
}finally{await browser.close();}
