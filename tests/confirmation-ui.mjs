import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {publicConfig} from '../server/config.js';
import {Keypair} from '@solana/web3.js';

// Isolated pending-launch fixture. Read-only confirmation must never resubmit.
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 let status='Pending',checks=0,submits=0;
 const owner=Keypair.generate().publicKey.toBase58(),agent={id:'confirmation-test',no:1,name:'Confirmation test',creator:owner,createdAt:Date.now(),character:'frank',strategy:'balanced',status:'DRAFT',coin:{name:'Test',ticker:'TEST'}};
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/state')return route.fulfill({json:{config:publicConfig('devnet'),session:{address:owner},agents:[agent],events:[],coins:[],feed:[],tokens:[],bonded:[],stats:{}}});
  if(path==='/api/agents/confirmation-test')return route.fulfill({json:agent});
  if(path==='/api/wallet/mainnet-balance')return route.fulfill({json:{owner,lamports:0}});
  if(path==='/api/pump-launch/status'){checks++;return route.fulfill({json:{agentId:agent.id,owner:agent.creator,network:'solana:101',status,signature:'fixture-signature',mint:'fixture-mint',canStartFreshPreparation:status==='Failed'}});}
  if(path==='/api/pump-launch/submit'){submits++;return route.fulfill({status:409,json:{error:'Unexpected submit'}});}
  return route.fulfill({status:404,json:{error:'Unavailable in confirmation fixture'}});
 });
 await page.goto((process.env.BASE_URL||'http://127.0.0.1:5188')+'/#/agent/confirmation-test');
 await page.locator('.ad-token-action').click();
 await page.locator('#tw-mainnet-launch').waitFor();await page.waitForTimeout(1000);
 assert.equal(await page.locator('#tw-mainnet-launch [data-check]').isVisible(),true,await page.locator('#tw-mainnet-launch').innerText());
 const before=checks;await page.locator('#tw-mainnet-launch [data-check]').click();
 assert.equal(checks,before+1);assert.equal(submits,0);
 assert.match(await page.locator('#tw-mainnet-launch [data-status]').textContent(),/Reconciliation required/);
 status='Failed';await page.locator('#tw-mainnet-launch [data-check]').click();
 await page.locator('#tw-mainnet-launch [data-status]').getByText(/Previous attempt ended/).waitFor();
 assert.match(await page.locator('#tw-mainnet-launch [data-status]').textContent(),/Previous attempt ended/);
 assert.equal(await page.locator('#tw-mainnet-launch [data-check]').isHidden(),true);
 assert.equal(submits,0);
 console.log('Confirmation UI passed: pending receipt checks are read-only, terminal failure hides retry, no duplicate submit.');
}finally{await browser.close();}
