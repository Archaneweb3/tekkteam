import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {publicConfig} from '../server/config.js';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const base=process.env.BASE_URL||'http://127.0.0.1:5188';
const owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
const wallet='7Bt9Q3EciD8ZhoRA6CviqwpLpGhn4tscPrsKfUqGfFVe';
const makeAgents=count=>Array.from({length:count},(_,i)=>({id:`wallet-fixture-${i}`,no:i+1,name:`Agent ${i+1}`,creator:owner,createdAt:Date.now(),character:'frank',strategy:'balanced',status:'DRAFT',coin:{name:'Fixture',ticker:'FIX'}}));
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390])for(const count of [1,5,20]){
  const agents=makeAgents(count),page=await browser.newPage({viewport:{width,height:900}}),writes=[];
  let ownerReads=0,agentReads=0,operationChecks=0,unavailable=false,transferStatus='SUBMITTED';
  await page.route('**/api/**',route=>{
   const url=new URL(route.request().url()),path=url.pathname;
   if(route.request().method()!=='GET'){writes.push(path);return route.abort();}
   if(path==='/api/state')return route.fulfill({json:{config:publicConfig('devnet'),session:{address:owner},agents,events:[],coins:[],feed:[],tokens:[],bonded:[],stats:{}}});
   if(path==='/api/wallet/mainnet-balance'){ownerReads++;return route.fulfill({json:{owner,network:'solana:101',lamports:100000000,checkedAt:Date.now(),slot:123}});}
   const match=path.match(/^\/api\/agents\/(wallet-fixture-\d+)\/trading\/wallet$/);
   if(match){agentReads++;const index=Number(match[1].split('-').at(-1));return route.fulfill({json:{agentId:match[1],ownerWallet:owner,agentWallet:index===0?wallet:`AgentWallet${index}`,balanceStatus:unavailable&&index===0?'UNAVAILABLE':'AVAILABLE',balanceLamports:unavailable&&index===0?null:5000000,assetStatus:'AVAILABLE',assetCount:index===0?1:0,assets:index===0?[{mint:'USELESSfixtureMint',amount:'45962',decimals:6}]:[],activity:index===0?[{id:'fund-fixture',kind:'FUND',source:owner,destination:wallet,amountLamports:2000000,status:transferStatus,signature:'fixture-signature',createdAt:Date.now()}]:[],fundingEnabled:false,withdrawalEnabled:false}});}
   if(path.endsWith('/funding/fund-fixture')){operationChecks++;transferStatus='CONFIRMED';return route.fulfill({json:{id:'fund-fixture',status:'CONFIRMED'}});}
   return route.fulfill({status:404,json:{error:'Fixture only'}});
  });
  await page.goto(base+'/#/wallet');
  await page.locator('.tw-wallet-table tbody tr').first().waitFor();
  await page.waitForFunction(expected=>document.querySelectorAll('.tw-wallet-table [data-state="VERIFIED"]').length===expected,count);
  assert.equal(await page.locator('.tw-header nav [data-nav="wallet"]').count(),1);
  assert.equal(await page.locator('.tw-header nav [data-nav="how"] + [data-nav="wallet"]').count(),1);
  assert.equal(await page.locator('.tw-wallet-table tbody tr').count(),count);
  assert.match(await page.locator('.tw-wallet-treasury').innerText(),new RegExp(String(Number((0.1+count*0.005).toFixed(3))).replace('.','\\.')+' SOL'));
  assert.match(await page.locator('.tw-wallet-owner').innerText(),/0\.1 SOL/);
  if(process.env.WALLET_SCREENSHOTS&&count===5)await page.screenshot({path:join(tmpdir(),`tekkwork-wallet-${width}.png`),fullPage:true});
  await page.locator('[data-wallet-refresh]').click();await page.waitForFunction(()=>document.querySelector('[data-wallet-refresh]')?.textContent==='REFRESH BALANCE');assert.ok(ownerReads>=2);
  await page.locator('[data-wallet-manage="wallet-fixture-0"]').click();await page.locator('.tw-agent-wallet-drawer .tw-wallet-assets-section').waitFor();
  assert.equal(await page.locator('.tw-agent-wallet-drawer').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,`Wallet drawer overflow at ${width}px`);
  assert.match(await page.locator('.tw-agent-wallet-drawer').innerText(),/0\.045962/);
  assert.equal(await page.locator('.tw-agent-wallet-drawer [data-do="fund"]').isDisabled(),true);
  assert.equal(await page.locator('.tw-agent-wallet-drawer [data-do="withdraw"]').isDisabled(),true);
  await page.locator('.tw-wallet-drawer-close').click();await page.locator('.tw-agent-wallet-drawer').waitFor({state:'detached'});
  await page.locator('.tw-wallet-transfer summary').first().click();await page.locator('[data-wallet-check]').click();await page.waitForFunction(()=>document.querySelector('[data-wallet-check]')?.textContent==='CHECK STATUS');assert.equal(operationChecks,1);
  await page.locator('.tw-wallet-transfer-status').getByText('CONFIRMED').waitFor();
  transferStatus='FAILED';await page.locator('[data-wallet-manage="wallet-fixture-0"]').click();await page.locator('.tw-wallet-drawer-close').click();await page.locator('.tw-agent-wallet-drawer').waitFor({state:'detached'});await page.locator('.tw-wallet-transfer-status').getByText('FAILED').waitFor();
  unavailable=true;await page.locator('[data-wallet-manage="wallet-fixture-0"]').click();await page.locator('.tw-wallet-drawer-close').click();await page.locator('.tw-agent-wallet-drawer').waitFor({state:'detached'});
  await page.waitForFunction(()=>document.querySelector('.tw-wallet-treasury')?.textContent.includes('PARTIAL BALANCE'));
  assert.match(await page.locator('.tw-wallet-table tbody tr').first().innerText(),/BALANCE UNAVAILABLE/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`Wallet overflow at ${width}px / ${count} Agents`);
  assert.deepEqual(writes,[]);
  await page.close();
 }
 const disconnected=await browser.newPage(),reads=[];
 await disconnected.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;reads.push(path);if(path==='/api/state')return route.fulfill({json:{config:publicConfig('devnet'),session:null,agents:[],events:[],coins:[],feed:[],tokens:[],bonded:[],stats:{}}});return route.abort();});
 await disconnected.goto(base+'/#/wallet');await disconnected.locator('[data-wallet-connect]').waitFor();
 assert.match(await disconnected.locator('.tw-wallet-owner').innerText(),/NOT CONNECTED/);
 assert.equal(reads.some(path=>path.includes('mainnet-balance')||path.includes('/trading/wallet')),false);
 await disconnected.close();
 console.log('Wallet workspace navigation, owner/agent Mainnet reads, 1/5/20 agents, drawer, status reconciliation, unavailable balance and 1440/390 passed.');
}finally{await browser.close();}
