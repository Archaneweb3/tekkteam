import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
// This fixture uses native ES modules; serve only its HTML and source JS, without
// starting Vite's application dependency discovery or exposing configuration files.
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://fixture').pathname;if(!/^(?:\/tests\/wallet-intent-fixture\.html|\/(?:public\/app|src)\/[a-zA-Z0-9_-]+\.js)$/.test(path)){res.writeHead(404);res.end();return;}try{const body=await readFile(resolve('.'+path));res.setHeader('Content-Type',path.endsWith('.js')?'application/javascript':'text/html');res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.route('**/api/**',r=>r.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/wallet-intent-fixture.html`);
 await page.evaluate(async()=>{
  const {mountAgentWallet}=await import('/public/app/agent-wallet-ui.js');
  let seq=0;Object.defineProperty(crypto,'randomUUID',{value:()=>`fixture-key-${String(++seq).padStart(8,'0')}`});
  const state={agentId:'fixture-agent',ownerWallet:'fixture-owner',agentWallet:'fixture-wallet',balanceStatus:'AVAILABLE',balanceLamports:10000000,fundingEnabled:true,withdrawalEnabled:true,activity:[]};
  const calls=[];let operation;
  window.qa={calls,state,fail:true,hold:false,release:null};
  const api=async(path,options={})=>{
   if(path.endsWith('/wallet'))return {...state};
   if(path.endsWith('/withdrawal/max'))return {agentId:state.agentId,source:state.agentWallet,destination:state.ownerWallet,network:'solana:mainnet',maxLamports:9990000};
   const body=JSON.parse(options.body||'{}');calls.push({path,...body});
   if(path.endsWith('/prepare')){
    if(window.qa.hold)await new Promise(resolve=>window.qa.release=resolve);
    if(window.qa.fail)throw Error('Fixture preparation failed');
    const kind=path.includes('/funding/')?'FUND':'WITHDRAW';
    operation={id:'fixture-'+calls.length,kind,status:'PREPARED',amountLamports:body.lamports,feeLamports:5000,baseFeeLamports:5000,priorityFeeLamports:0,sourceBalanceLamports:10000000,remainingLamports:4995000,expectedDestinationBalanceLamports:105000000};state.activity=[operation];return operation;
   }
   if(path.endsWith('/submit')||path.endsWith('/confirm')){operation={...operation,status:'CONFIRMED'};state.activity=[operation];return operation;}
   if(path.endsWith('/cancel')){operation={...operation,status:'FAILED'};state.activity=[operation];return operation;}
   throw Error('Unexpected fixture call');
  };
  window.qa.remount=()=>window.qa.mount=mountAgentWallet(document.querySelector('#wallet'),{id:state.agentId,name:'fixture'},{api,sign:async()=>{if(window.qa.signHold)await new Promise(resolve=>window.qa.signRelease=resolve);return 'fixture-not-a-real-signature';}});
  window.qa.remount();
 });
 const click=async name=>{try{await page.getByRole('button',{name,exact:true}).click({timeout:8000});}catch(e){console.error('BUTTON_STATE',name,await page.locator('body').innerText(),await page.locator('button').evaluateAll(els=>els.map(el=>({text:el.textContent,disabled:el.disabled}))));throw e;}};
 const fill=value=>page.getByLabel('Amount (SOL)',{exact:true}).fill(value);
 const key=()=>page.evaluate(()=>qa.calls.filter(x=>x.path.endsWith('/prepare')).at(-1).requestKey);
 const failed=async()=>{await click('Review withdrawal');await page.getByRole('alert').filter({hasText:'Fixture preparation failed'}).waitFor();};
 await click('WITHDRAW');await click('MAX');assert.equal(await page.getByLabel('Amount (SOL)',{exact:true}).inputValue(),'0.00999');await fill('0.05');await failed();const first=await key();
 await fill('0.005');await failed();const changed=await key();assert.notEqual(changed,first);
 await failed();assert.equal(await key(),changed);
 await page.evaluate(()=>qa.mount.refresh());await failed();assert.equal(await key(),changed);
 // Hold one prepare and invoke the same original handler twice: busy prevents a second call.
 await page.evaluate(()=>{qa.hold=true;qa.before=qa.calls.length;const b=document.querySelector('[data-do=prepare]');b.onclick();b.onclick();});
 assert.equal(await page.evaluate(()=>qa.calls.length-qa.before),1);assert.equal(await key(),changed);
 await page.evaluate(()=>{qa.hold=false;qa.release();});await page.getByRole('button',{name:'Review withdrawal',exact:true}).waitFor();
 await click('Cancel');await click('WITHDRAW');await fill('0.005');await failed();assert.notEqual(await key(),changed);
 // Successful funding -> genuinely new withdrawal uses another key (mock signer only).
 await click('Cancel');await page.evaluate(()=>qa.fail=false);await click('DEPOSIT');await fill('0.005');await click('Review funding');const fundKey=await key();await click('Review in Phantom');
 await click('WITHDRAW');await fill('0.005');await click('Review withdrawal');assert.notEqual(await key(),fundKey);
 assert.equal(await page.evaluate(()=>qa.calls.filter(x=>x.path.endsWith('/submit')).length),1);
 assert.equal(await page.evaluate(()=>qa.calls.filter(x=>x.path.endsWith('/confirm')).length),0);
 // Leaving Wallet while its signer is pending cannot submit into the next view.
 await click('Cancel');await click('DEPOSIT');await fill('0.005');await click('Review funding');
 await page.evaluate(()=>{qa.signHold=true;document.querySelector('[data-do=confirm]').onclick();});
 await page.waitForFunction(()=>!!qa.signRelease);
 await page.evaluate(()=>{qa.mount.destroy();qa.signRelease();});
 await page.waitForTimeout(30);
 assert.equal(await page.evaluate(()=>qa.calls.filter(x=>x.path.endsWith('/submit')).length),1,'Disposed wallet must never submit');
 await page.evaluate(()=>{qa.before=qa.calls.length;qa.remount();});
 await page.getByRole('button',{name:'Cancel unsigned request',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>qa.calls.length),await page.evaluate(()=>qa.before),'Remount only reads persisted status');
 console.log('PASS: wallet intent lifecycle, disposal during sign and read-only remount; fixture APIs only');
 await page.evaluate(()=>qa.mount.destroy());
}finally{await browser.close();await new Promise(r=>server.close(r));}
