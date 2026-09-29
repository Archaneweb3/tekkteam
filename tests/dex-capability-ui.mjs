import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'error'});
await server.listen();
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]+'tests/dex-fixture.html');
  await page.evaluate(async()=>{
    const {mountControlledSwap}=await import('/app/controlled-swap-ui.js');
    const clock=Date.now();
    const prepared={id:'capability-fixture',status:'PREPARED',messageHash:'a'.repeat(64),usdcDecimals:6,review:{totalProtectedLamports:'2020000',agentBalanceLamports:'6995000',peakAvailableAfterLamports:'3908120'},inputAmount:'100000',estimatedOutput:'12250',minimumOutput:'12127',slippageBps:100,pool:'fixture-pool',networkFeeLamports:'5000',networkFeeCapLamports:'10000',ataRentLamports:'2976880',quoteReference:'fixture-quote',expiresAt:clock+25000};
    const status={enabled:true,prepareEnabled:true,acceptanceEligible:true,signingArmed:false,liveEnabled:false,autonomousKillSwitch:true,realMoneyEmergencyStop:true,currentExecutionId:null,records:[],armEligibility:{executionId:null,eligible:false,reason:'NO_EXECUTION'}};
    window.capFixture={clock,prepared,status};
    const api=async(path)=>{
      if(path.endsWith('/controlled-swap'))throw Error('Legacy route unavailable');
      if(path.endsWith('/controlled-execution/prepare')){status.records=[prepared];status.currentExecutionId=prepared.id;status.acceptanceEligible=false;status.armEligibility={executionId:prepared.id,eligible:true,reason:null};return {...prepared,confirmationToken:'private-fixture-capability'};}
      if(path.endsWith('/controlled-execution'))return status;
      throw Error('Unexpected fixture operation');
    };
    window.capMount=mountControlledSwap(document.querySelector('#dex'),{id:'capability-agent',name:'Capability fixture'},{api,now:()=>capFixture.clock});
  });
  await page.locator('#dex details').first().evaluate(node=>node.open=true);
  await page.getByRole('button',{name:'Prepare 0.0001 SOL → USDC review'}).click();
  assert.equal(await page.locator('#dex [data-dex=arm]').isEnabled(),true);
  assert.equal((await page.locator('#dex').textContent()).includes('private-fixture-capability'),false);
  assert.equal(await page.evaluate(()=>[...Object.values(localStorage),...Object.values(sessionStorage)].some(v=>v.includes('private-fixture-capability'))),false);

  // Expiry removes the volatile capability. A later erroneous status revival
  // cannot recreate that secret on the client.
  await page.evaluate(()=>{capFixture.clock+=26000;});
  await page.waitForFunction(()=>document.querySelector('[data-dex=arm]').disabled);
  await page.evaluate(async()=>{
    capFixture.status.records[0].status='EXPIRED';
    await capMount.refresh();
    capFixture.status.records[0].status='PREPARED';
    capFixture.status.records[0].expiresAt=capFixture.clock+25000;
    await capMount.refresh();
  });
  assert.equal(await page.locator('#dex [data-dex=arm]').isDisabled(),true);
  await page.getByText('CAPABILITY_MISSING — this browser session no longer holds the one-time confirmation capability for this execution. No signing was requested.').waitFor({state:'attached'});

  // A hard reload keeps only public fixture status, never the capability.
  await page.evaluate(()=>sessionStorage.setItem('publicControlledFixture',JSON.stringify(capFixture.status)));
  await page.reload();
  await page.evaluate(async()=>{
    const {mountControlledSwap}=await import('/app/controlled-swap-ui.js');
    const status=JSON.parse(sessionStorage.getItem('publicControlledFixture'));
    const api=async path=>path.endsWith('/controlled-execution')?status:Promise.reject(Error('Legacy unavailable'));
    window.reloadedMount=mountControlledSwap(document.querySelector('#dex'),{id:'capability-agent',name:'Capability fixture'},{api});
  });
  await page.locator('#dex [data-dex=arm]').waitFor({state:'attached'});
  assert.equal(await page.locator('#dex [data-dex=arm]').isDisabled(),true);
  await page.getByText('CAPABILITY_MISSING — this browser session no longer holds the one-time confirmation capability for this execution. No signing was requested.').waitFor({state:'attached'});
  assert.equal(await page.evaluate(()=>[...Object.values(localStorage),...Object.values(sessionStorage)].some(v=>v.includes('private-fixture-capability'))),false);
  console.log('PASS volatile capability: expiry purges it, terminal status does not revive it, reload cannot recover it, no DOM/browser storage exposure.');
}finally{await browser.close();await server.close();}
