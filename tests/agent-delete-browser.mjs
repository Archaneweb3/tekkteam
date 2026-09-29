import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {publicConfig} from '../server/config.js';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const base=process.env.BASE_URL||'http://127.0.0.1:5188';
const owner='fixture-owner',agent={id:'delete-flow-fixture',no:2,name:'LPAD TEST',creator:owner,createdAt:Date.now(),character:'frank',strategy:'balanced',status:'DRAFT',coin:{name:'Fixture',ticker:'FIX'}};
const blocks=['AGENT_WALLET_HAS_SOL','AGENT_WALLET_HAS_TOKENS','PAPER_POSITION_OPEN','REAL_POSITION_OPEN','ACTIVE_RESERVATION','UNRESOLVED_EXECUTION','PENDING_TOKEN_SUBMISSION','CUSTODY_OR_AUDIT_RECORDS'];
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  let eligible=false,deleteCalls=0,eligibilityCalls=0,changeBeforeDelete=false;
  const page=await browser.newPage({viewport:{width,height:900}});
  page.on('pageerror',error=>{throw error;});
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname,method=route.request().method();
   if(path==='/api/state')return route.fulfill({json:{config:publicConfig('devnet'),session:{address:owner},agents:[agent],events:[],coins:[],feed:[],tokens:[],bonded:[],stats:{}}});
   if(path==='/api/agents/'+agent.id&&method==='GET')return route.fulfill({json:agent});
   if(path.endsWith('/deletion-eligibility')){eligibilityCalls++;if(changeBeforeDelete&&eligibilityCalls>=2)eligible=false;return route.fulfill({json:{agentId:agent.id,canDelete:eligible,deleteEligible:eligible,launchState:'unlaunched',solLamports:5401560,deleteBlockedReasons:eligible?[]:blocks.map(code=>({code,message:'Server diagnostic'}))}});}
   if(path==='/api/agents/'+agent.id&&method==='DELETE'){deleteCalls++;return route.fulfill({json:{deleted:true,agentId:agent.id}});}
   if(path.endsWith('/trading'))return route.fulfill({json:{agentId:agent.id,status:'PAUSED',strategy:'balanced',activity:[],openPositions:[]}});
   if(path.endsWith('/trading/wallet'))return route.fulfill({json:{agentId:agent.id,ownerWallet:owner,agentWallet:'7Bt9Q3EciD8ZhoRA6CviqwpLpGhn4tscPrsKfUqGfFVe',balanceStatus:'AVAILABLE',balanceLamports:5401560,assetStatus:'AVAILABLE',assetCount:0,assets:[],activity:[],fundingEnabled:false,withdrawalEnabled:false}});
   if(path.endsWith('/trading/strategy-config'))return route.fulfill({json:{agentId:agent.id,config:{strategy:'balanced'}}});
   if(path.endsWith('/analytics'))return route.fulfill({json:{agentId:agent.id}});
   return route.fulfill({status:404,json:{error:'Fixture only'}});
  });
  await page.goto(base+'/#/agent/'+agent.id);await page.getByLabel('Agent actions').click();
  const menu=page.locator('.tw-agent-menu-panel');assert.equal(await menu.locator('button').count(),2);assert.doesNotMatch(await menu.innerText(),/balance|history|locked/i);
  await menu.locator('#tw-delete-draft').click();await page.locator('.tw-delete-dialog [data-blocker]').first().waitFor();
  assert.equal(await page.locator('.tw-delete-dialog [data-blocker]').count(),blocks.length);assert.equal(await page.locator('.tw-delete-dialog [data-delete-confirm]').count(),0);assert.match(await page.locator('.tw-delete-dialog').innerText(),/0\.005402 SOL/);assert.equal(deleteCalls,0);
  await page.locator('[data-delete-setup]').click();await page.locator('[data-delete-refresh]').waitFor();assert.match(await page.locator('.tw-delete-dialog').innerText(),/PREPARE FOR DELETION/);assert.equal(deleteCalls,0);
  const beforeRefresh=eligibilityCalls;await page.locator('[data-delete-refresh]').click();await page.waitForFunction(count=>window.__unused===undefined&&document.querySelector('[data-delete-refresh]')?.textContent==='REFRESH STATUS',beforeRefresh);assert.ok(eligibilityCalls>beforeRefresh);
  if(process.env.DELETE_SCREENSHOTS)await page.screenshot({path:join(tmpdir(),`tekkwork-delete-blocked-${width}.png`)});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.locator('.tw-delete-dialog [data-delete-resolve="wallet"]').first().click();
  await page.locator('.tw-agent-wallet-drawer .tw-wallet-assets-section').waitFor();
  assert.equal(await page.locator('.tw-agent-wallet-drawer').count(),1,'Delete Agent opens the shared wallet drawer');
  assert.match(await page.locator('.tw-agent-wallet-drawer').innerText(),/0\.00540156 SOL/);
  await page.locator('.tw-wallet-drawer-close').click();await page.locator('.tw-agent-wallet-drawer').waitFor({state:'detached'});assert.equal(deleteCalls,0);
  eligible=true;eligibilityCalls=0;await page.getByLabel('Agent actions').click();await menu.locator('#tw-delete-draft').click();await page.locator('[data-delete-word]').waitFor();
  assert.equal(await page.locator('[data-delete-confirm]').isDisabled(),true);await page.locator('[data-delete-word]').fill('DELETE');assert.equal(await page.locator('[data-delete-confirm]').isEnabled(),true);
  if(process.env.DELETE_SCREENSHOTS)await page.screenshot({path:join(tmpdir(),`tekkwork-delete-eligible-${width}.png`)});
  changeBeforeDelete=true;await page.locator('[data-delete-confirm]').click();await page.locator('.tw-delete-dialog [data-blocker]').first().waitFor();assert.equal(deleteCalls,0,'State change before confirmation blocks mutation');
  await page.locator('.tw-delete-dialog .tw-dialog-actions [data-cancel]').click();changeBeforeDelete=false;eligible=true;eligibilityCalls=0;
  await page.getByLabel('Agent actions').click();await menu.locator('#tw-delete-draft').click();await page.locator('[data-delete-word]').waitFor();await page.locator('[data-delete-word]').fill('DELETE');await page.locator('[data-delete-confirm]').click();
  await page.waitForURL('**/#/agents');await page.locator('.tw-delete-dialog').waitFor({state:'detached'});assert.equal(deleteCalls,1);await page.close();
 }
 console.log('Delete Agent blocked, state-change, eligible, success and 1440/390 fixture flows passed.');
}finally{await browser.close();}
