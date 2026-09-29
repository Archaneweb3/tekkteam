import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'silent'});
await server.listen();const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.route('**/api/**',r=>r.abort());
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/wallet-intent-fixture.html`);
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
  window.qa.mount=mountAgentWallet(document.querySelector('#wallet'),{id:state.agentId,name:'fixture'},{api,sign:async()=> 'fixture-not-a-real-signature'});
 });
 const click=name=>page.getByRole('button',{name,exact:true}).click();
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
 console.log('PASS: 6 production-UI lifecycle scenarios; fixture APIs only; no real wallet/RPC/transactions');
 await page.evaluate(()=>qa.mount.destroy());
}finally{await browser.close();await server.close();}
