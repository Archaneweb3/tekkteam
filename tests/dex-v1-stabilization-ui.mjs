import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'error'});
await server.listen();
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto(server.resolvedUrls.local[0]+'tests/dex-fixture.html');
  await page.evaluate(async()=>{
   const {mountAutonomousAcceptance}=await import('/app/autonomous-acceptance-ui.js');
   const fixture={status:'UNKNOWN',emergencyStopped:false,canStart:false,cycleId:'cycle-1',buyExecutionId:'buy-1',history:[{id:'buy-1',direction:'BUY',status:'UNKNOWN',signature:'existing-signature'}],agentBalanceLamports:'6995000',failureReason:-32016};
   let calls=0,resolves=[];
   const api=async(path,options)=>{
    if(options?.method==='POST'&&path.endsWith('/emergency-stop')){calls++;return await new Promise(resolve=>resolves.push(resolve));}
    if(options?.method==='POST')throw Error('UNEXPECTED_START');
    return fixture;
   };
   window.testState={fixture,get calls(){return calls;},resolves};
   window.mount=mountAutonomousAcceptance(document.querySelector('#dex'),{id:'fixture-agent'},{api,confirmAction:()=>true});
  });
  const stop=page.locator('[data-stop]');
  await stop.waitFor();
  for(const status of ['ARMED','BUYING','POSITION_OPEN','UNKNOWN']){
   await page.evaluate(async status=>{testState.fixture.status=status;await mount.refresh();},status);
   assert.equal(await stop.isEnabled(),true,status);
  }
  await page.evaluate(async()=>{testState.fixture.status='UNKNOWN';await mount.refresh();});
  assert.match(await page.locator('#dex').textContent(),/Do not retry/);
  assert.doesNotMatch(await page.locator('#dex').textContent(),/no transaction was sent/);
  await stop.click();
  await page.evaluate(()=>document.querySelector('[data-stop]').click());
  assert.equal(await page.evaluate(()=>testState.calls),1);
  await page.evaluate(()=>testState.resolves.shift()({status:'UNKNOWN',cycleId:'cycle-1',emergencyStopped:true}));
  await page.getByText('EMERGENCY STOP ACTIVE',{exact:true}).first().waitFor();
  assert.equal(await stop.isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>mount.destroy());
  await page.evaluate(async()=>{
   const {mountAutonomousAcceptance}=await import('/app/autonomous-acceptance-ui.js');
   window.rejectMount=mountAutonomousAcceptance(document.querySelector('#dex'),{id:'fixture-agent'},{api:async(path,options)=>{if(options?.method==='POST')throw Error('OWNER_AUTH_REQUIRED');throw Error('Status temporarily unavailable');},confirmAction:()=>true});
  });
  await page.getByText('Status temporarily unavailable').waitFor();
  assert.equal(await stop.isEnabled(),true);
  await stop.click();
  await page.getByText('OWNER_AUTH_REQUIRED').waitFor();
  assert.equal(await stop.isEnabled(),true);
  await page.evaluate(()=>rejectMount.destroy());
  await page.evaluate(async()=>{
   const {mountControlledSwap}=await import('/app/controlled-swap-ui.js');
   window.controlledMount=mountControlledSwap(document.querySelector('#dex'),{id:'fixture-agent',name:'Fixture'},{api:async path=>{
    if(path.endsWith('/controlled-execution'))return {enabled:true,prepareEnabled:true,acceptanceEligible:false,signingArmed:false,records:[],currentExecutionId:null};
    throw Error('Legacy quote unavailable');
   }});
  });
  await page.getByText('Controlled Real',{exact:true}).waitFor();
  assert.equal(await page.getByText('Developer / Acceptance Tools').count(),1);
  assert.equal(await page.getByLabel('Explicit token mint').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>controlledMount.destroy());
  await page.close();
 }
 console.log('PASS 1440px and 390px: safety states, double-click, backend error, product/debug separation, no arbitrary acceptance input, no overflow.');
}finally{await browser.close();await server.close();}
