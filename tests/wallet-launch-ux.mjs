import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Keypair} from '@solana/web3.js';
import {publicConfig} from '../server/config.js';
import {buildCreation,creationAccounts,PAYER} from '../src/pump-readiness.js';
import {agentLaunchData} from '../src/agent-launch-data.js';
const agent={id:'ux-agent',no:1,name:'Frank',creator:PAYER,character:'frank',strategy:'selective',status:'DRAFT',createdAt:Date.now(),coin:{name:'Frank Coin',ticker:'FRK'}};
const launch={...agentLaunchData(agent),metadataUri:'https://metadata.example/agent.json',initialBuyLamports:0};
const original=JSON.parse(readFileSync(new URL('../docs/pump-simulation-2026-09-26.json',import.meta.url))),mint=Keypair.generate(),accounts=creationAccounts(mint.publicKey,PAYER);
let json=JSON.stringify(original);original.structure.accounts.forEach((a,i)=>json=json.replaceAll(a.address,accounts[i].pubkey.toBase58()));
const evidence=JSON.parse(json),tx=buildCreation(mint.publicKey,evidence.recentBlockhash,launch);evidence.launch=launch;evidence.metadataUri=launch.metadataUri;evidence.transactionBase64=tx.serialize({requireAllSignatures:false}).toString('base64');tx.partialSign(mint);evidence.walletTransactionBase64=tx.serialize({requireAllSignatures:false}).toString('base64');evidence.createdAt=new Date().toISOString();
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();let balanceReads=0,failBalance=false,prepareCount=0,otherPosts=0;
 await page.addInitScript(owner=>{window.phantom={solana:{isPhantom:true,isConnected:true,publicKey:{toBase58:()=>owner},signTransaction:()=>{throw Error('Wallet requests forbidden in test');}}};},PAYER);
 await page.route('**/api/**',route=>{
  const r=route.request(),url=new URL(r.url()),path=url.pathname;let data;
  if(path==='/api/state')data={session:{address:PAYER},agents:[agent],config:publicConfig('devnet'),events:[],stats:{}};
  else if(path==='/api/wallet/mainnet-balance'){balanceReads++;return route.fulfill(failBalance?{status:503,json:{error:'Mainnet balance unavailable'}}:{json:{owner:PAYER,network:'solana:101',lamports:17664446}});}
  else if(path==='/api/agents/ux-agent')data=agent;
  else if(path.endsWith('/deletion-eligibility'))data={agentId:agent.id,canDelete:true,launchState:'unlaunched'};
  else if(path==='/api/pump-launch/status')data={status:'Idle'};
  else if(path==='/api/pump-launch/prepare'){prepareCount++;assert.equal(r.postDataJSON().initialBuy,'0');data={id:'prepared-id',evidence};}
  else{if(r.method()==='POST')otherPosts++;return route.abort();}
  return route.fulfill({json:data});
 });
 await page.goto('http://127.0.0.1:5188/#/agent/ux-agent');await page.getByText('Ready to prepare this agent',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('#tw-wallet').textContent.includes('0.0177 SOL'));
 await page.locator('[data-prepare]').click();await page.getByText('Review final summary',{exact:true}).waitFor();assert.equal(await page.locator('[data-approve]').isVisible(),true);
 await page.locator('[data-buy]').fill('0.025');assert.equal(await page.locator('[data-approve]').isVisible(),false);assert.equal(await page.locator('[data-prepare]').isEnabled(),true);assert.match(await page.locator('[data-summary]').innerText(),/Prepare again/);
 await page.locator('[data-buy]').fill('-1');assert.equal(await page.locator('[data-prepare]').isEnabled(),false);await page.locator('[data-buy]').fill('0.025');
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.locator('#tw-wallet').click();await page.locator('.tw-wallet-popover').waitFor();assert.match(await page.locator('.tw-wallet-popover').innerText(),/Solana Mainnet/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`wallet-launch-${width}.png`,fullPage:true});await page.locator('#tw-wallet').click();}
 const before=balanceReads;await page.evaluate(()=>window.dispatchEvent(new CustomEvent('tekkwork:balance-changed')));await page.waitForFunction(()=>document.querySelector('#tw-wallet').textContent.includes('0.0177 SOL'));await page.waitForTimeout(100);assert.ok(balanceReads>before);
 failBalance=true;await page.locator('#tw-wallet').click();await page.locator('[data-refresh]').click();await page.waitForFunction(()=>document.querySelector('#tw-wallet').textContent.includes('Balance unavailable'));assert.doesNotMatch(await page.locator('#tw-wallet').innerText(),/0.0000/);
 assert.equal(prepareCount,1);assert.equal(otherPosts,0);console.log('PASS wallet balance/popover/refresh/error, input invalidation, desktop/mobile; mocked prepare only, no wallet/sign/send.');
}finally{await browser.close();}
