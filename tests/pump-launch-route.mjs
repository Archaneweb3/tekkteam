import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {publicConfig} from '../server/config.js';
import {LIMITS} from '../server/paper-engine.js';
const owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
const agents=[{id:'agent-one',no:1,name:'Felix Studio',creator:owner,character:'frank',avatarSeed:'skin:frank',strategy:'selective',status:'DRAFT',description:'Independent workspace',createdAt:Date.now(),coin:{name:'Felix Token',ticker:'FLX',mint:null}},{id:'agent-two',no:2,name:'Otto Studio',creator:owner,character:'diamond',avatarSeed:'skin:diamond',strategy:'selective',status:'DRAFT',description:'Second workspace',createdAt:Date.now(),coin:{name:'Otto Token',ticker:'OTTO',mint:null}}];
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[],writes=[];let live=false,deletes=0;
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()==='POST')writes.push(r.url());});
 // UI-only fixtures: no wallet, preparation, simulation or broadcast is invoked.
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url());let data;
  if(route.request().method()==='DELETE'){deletes++;const i=agents.findIndex(a=>a.id===url.pathname.split('/').at(-1));if(agents[i].status==='FAILED')return route.fulfill({status:409,json:{error:'Only an unlaunched draft can be deleted.'}});agents.splice(i,1);return route.fulfill({json:{deleted:true}});}
  if(url.pathname==='/api/state')data={config:publicConfig('devnet'),session:{address:owner},agents,events:[],stats:{agentsTotal:2,drafts:2,testLaunches:0}};
  else if(url.pathname.endsWith('/deletion-eligibility')){const agentId=url.pathname.split('/').at(-2);data={agentId,canDelete:!(live&&agentId==='agent-one'),launchState:live&&agentId==='agent-one'?'launched':'unlaunched',reason:null};}
  else if(url.pathname.endsWith('/trading'))data={fundingLocked:true,tokenLive:live&&url.pathname.includes('agent-one'),wallet:{address:owner,balanceLamports:0},enabled:false,profiles:['selective','momentum'],strategy:'selective',limits:LIMITS,health:'Healthy',activity:[],position:null};
  else if(url.pathname.startsWith('/api/agents/'))data=agents.find(a=>a.id===url.pathname.split('/').at(-1));
  else if(url.pathname==='/api/pump-launch/status')data=live&&url.searchParams.get('agentId')==='agent-one'?{agentId:'agent-one',owner,network:'solana:101',status:'Success',confirmed:true,tokenName:'Felix Token',symbol:'FLX',mint:owner,signature:'fixture-signature',observedSpendLamports:5511640}:{status:'Idle'};
  else return route.abort();
  return route.fulfill({json:data});
 });
 await page.goto('http://127.0.0.1:5188/#/agent/agent-one');
 await page.getByText('Ready to prepare this agent',{exact:true}).waitFor();
 const body=await page.locator('body').innerText();
 assert.match(body,/Solana Mainnet \/ solana:101/);assert.match(body,/Felix Token \/ \$FLX/);
 assert.doesNotMatch(body,/EXECUTION \/ DEVNET|REVIEW DEVNET MINT|TEST IT BEFORE IT GOES LIVE|TEKKWORK TEST|solana:devnet/i);
 assert.equal(await page.locator('[data-prepare]').isEnabled(),true);
 assert.equal(await page.locator('[data-approve]').isVisible(),false);
 await page.locator('#tw-mainnet-launch').scrollIntoViewIfNeeded();
 await page.screenshot({path:'agent-launch-integration.png',fullPage:true});
 live=true;await page.reload();await page.getByRole('heading',{name:'TOKEN LIVE',exact:true}).waitFor();
 assert.equal(await page.locator('[data-prepare]').isVisible(),false);assert.equal(await page.locator('[data-approve]').isVisible(),false);
 assert.equal(await page.getByRole('link',{name:'Pump.fun token'}).count(),1);
 await page.getByLabel('Agent actions').click();await page.waitForFunction(()=>document.querySelector('#tw-delete-draft').hidden);assert.equal(await page.locator('#tw-delete-draft').isVisible(),false);await page.getByLabel('Agent actions').click();
 await page.getByRole('button',{name:'Enable paper trading'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Fund agent',exact:true}).isEnabled(),false);
 for(const width of [1440,1280,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`paper-trading-${width}.png`,fullPage:true});}
 await page.goto('http://127.0.0.1:5188/#/agent/agent-two');await page.getByText('Ready to prepare this agent',{exact:true}).waitFor();
 assert.match(await page.locator('#tw-mainnet-launch').innerText(),/Otto Token \/ \$OTTO/);
 assert.equal(await page.locator('[data-result]').innerText(),'');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'agent-launch-integration-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 for(const width of [1440,1280,390]){
  await page.setViewportSize({width,height:1000});
  await page.goto('http://127.0.0.1:5188/#/agents');
  await page.locator('.tw-agent img[data-ready="true"]').first().waitFor();
  assert.equal(await page.locator('.tw-agent').count(),2);
  assert.equal(await page.locator('.tw-agent img[data-character="frank"]').count(),1);
  assert.equal(await page.locator('.tw-agent img[data-character="diamond"]').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await page.locator('.tw-agent h3').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=24),true);
  assert.equal(await page.locator('.tw-header nav .tw-icon').count(),5);
  assert.doesNotMatch(await page.locator('body').innerText(),/↗|◆|▦|⬡|✦|⌕|＋/);
  await page.screenshot({path:`polish-roster-${width}.png`,fullPage:true});
  await page.locator('.tw-agent').last().click();
  await page.getByText('Ready to prepare this agent',{exact:true}).waitFor();
  await page.getByLabel('Agent actions').click();
  await page.waitForFunction(()=>!document.querySelector('#tw-delete-draft')?.disabled);
  await page.getByRole('button',{name:'Delete draft',exact:true}).click();
  await page.getByRole('heading',{name:'Delete Otto Studio?'}).waitFor();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByLabel('Agent actions').click();
  await page.getByRole('button',{name:'Edit strategy',exact:true}).click();
  assert.equal(await page.locator('#tw-strategy').evaluate(el=>el===document.activeElement),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`polish-detail-${width}.png`,fullPage:true});
  await page.goto('http://127.0.0.1:5188/#/');
  await page.locator('.desk-heading').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`polish-overview-${width}.png`,fullPage:true});
 }
 agents[1].status='FAILED';await page.goto('http://127.0.0.1:5188/#/agent/agent-two');await page.getByLabel('Agent actions').click();await page.waitForFunction(()=>!document.querySelector('#tw-delete-draft').disabled);
 assert.equal(await page.locator('#tw-delete-draft svg').count(),1);await page.locator('#tw-delete-draft').click();await page.locator('dialog [data-delete]').click();await page.getByRole('alert').filter({hasText:'Only an unlaunched draft'}).waitFor();await page.locator('dialog [data-cancel]').click();
 agents[1].status='DRAFT';await page.reload();await page.getByLabel('Agent actions').click();await page.waitForFunction(()=>!document.querySelector('#tw-delete-draft').disabled);await page.locator('#tw-delete-draft').click();await page.locator('dialog [data-delete]').click();await page.waitForURL('**/#/agents');await page.locator('dialog').waitFor({state:'detached'});await page.locator('.tw-agent').waitFor();assert.equal(await page.locator('.tw-agent').count(),1);assert.equal(deletes,2);await page.getByText('Draft deleted',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 console.log('Agent Detail Mainnet integration PASS: unlaunched/live/per-agent isolation, desktop/mobile; zero wallet/POST requests (UI fixtures).');
}finally{await browser.close();}
