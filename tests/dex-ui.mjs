import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const origin = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  let realApi = 0;
  await page.route('**/api/**', route => { realApi++; return route.abort(); });
  await page.goto(origin + 'tests/dex-fixture.html');
  await page.evaluate(async () => {
    const { mountControlledSwap } = await import('/app/controlled-swap-ui.js');
    window.qa = { calls: [], fail: false, clock: 1000, count: 0, records: [] };
    const api = async (path, opts = {}) => {
      const body = opts.body ? JSON.parse(opts.body) : null; qa.calls.push({ path, body });
      if (!body) return { mode: 'CONTROLLED_REAL', enabled: false, liveEnabled: false, killSwitch: true, adapterReady: false, quoteAvailable: true, riskPolicy: { protectedLamports: '2020000' }, records: qa.records };
      if (path.endsWith('/cancel')) {
        const r = qa.records.find(r => path.endsWith('/' + r.id + '/cancel'));
        if (!r || !['QUOTED', 'PREPARED'].includes(r.status) || r.signature) throw Error('Not safely cancellable');
        r.status = 'FAILED'; return r;
      }
      if (!path.endsWith('/quote')) throw Error('Unexpected operation');
      if (qa.fail) throw Error('Fixture unavailable');
      if (qa.hold) await new Promise(resolve => qa.release = resolve);
      const active = qa.records.find(r => ['QUOTED', 'PREPARED', 'SIGNED', 'SUBMITTED', 'UNKNOWN'].includes(r.status));
      if (active) {
        if (active.requestKey !== body.requestKey) throw Error('Active request blocks replacement');
        if (JSON.stringify(active.intent) !== JSON.stringify(body)) throw Error('Idempotency conflict');
        return active;
      }
      if (qa.terminal) return { id: 'fixture', status: 'REJECTED_BEFORE_SIGNING', intent: body };
      const r = { id: 'fixture', requestKey: body.requestKey, status: 'QUOTED', intent: body, quote: { provider: 'JUPITER_SWAP_V2', ...body, estimatedOutput: '200000', minimumOutput: '198000', priceImpactPct: '0.01', route: [{ label: 'Fixture direct route' }], createdAt: qa.clock, expiresAt: qa.clock + 15000, reference: 'fixture-reference-not-executable', executable: false } };
      qa.records = [r]; return r;
    };
    qa.remount = () => { qa.mount?.destroy(); qa.mount = mountControlledSwap(document.querySelector('#dex'), { id: 'fixture-agent', name: 'Fixture agent · no real wallet' }, { api, now: () => qa.clock, newKey: () => 'fixture-key-' + (++qa.count) }); };
    qa.remount();
  });
  const button = name => page.getByRole('button', { name, exact: true });
  await page.locator('summary').waitFor();
  assert.equal(await page.locator('details').getAttribute('open'), null);
  await page.locator('summary').click();
  assert.equal(await page.getByLabel('Explicit token mint').inputValue(), '');
  assert.equal(await page.getByLabel('Input amount · raw base units').inputValue(), '');
  assert.equal(await button('Prepare controlled buy').isDisabled(), true);
  assert.equal(await button('CONFIRM CONTROLLED BUY').isDisabled(), true);
  const fill = async amount => {
    await page.getByLabel('Explicit token mint').fill('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    await page.getByLabel('Input amount · raw base units').fill(amount);
  };
  const quote = async () => { await button('Get read-only quote').click(); await button('Get read-only quote').waitFor(); };
  const key = () => page.evaluate(() => qa.calls.filter(x => x.path.endsWith('/quote')).at(-1).body.requestKey);
  await fill('100000'); await quote(); const first = await key();
  await page.getByRole('heading', { name: 'Read-only quote review' }).waitFor();
  assert.equal(await page.getByText('Unavailable — not prepared', { exact: true }).count(), 4);
  assert.equal(await page.getByText('2020000 lamports, plus transaction fees and account costs', { exact: true }).count(), 1);
  await quote(); assert.equal(await key(), first);
  await page.evaluate(() => qa.remount()); await page.locator('summary').click();
  await page.getByRole('heading', { name: 'Read-only quote review' }).waitFor();
  assert.equal(await page.getByLabel('Input amount · raw base units').inputValue(), '100000');
  await quote(); assert.equal(await key(), first);
  await button('Refresh status').click(); await quote(); assert.equal(await key(), first);
  await fill('50000'); assert.equal(await button('Get read-only quote').isDisabled(), true);
  assert.equal(await page.locator('[data-pending]').isVisible(), true);
  await button('Cancel / new intent').click();
  assert.equal(await page.evaluate(() => qa.calls.filter(x => x.path.endsWith('/cancel')).length), 1);
  await page.evaluate(() => qa.fail = true); await fill('50000'); await quote(); const changed = await key(); assert.notEqual(changed, first);
  await page.getByRole('alert').filter({ hasText: 'QUOTE UNAVAILABLE' }).waitFor();
  await quote(); assert.equal(await key(), changed);
  await page.getByLabel('Direction').selectOption('SELL'); await quote(); assert.notEqual(await key(), changed);
  await button('Cancel / new intent').click(); await fill('50000'); await page.evaluate(() => qa.fail = false); await quote(); assert.notEqual(await key(), changed);
  await page.evaluate(() => { qa.hold = true; qa.before = qa.calls.length; const action = document.querySelector('[data-dex=quote]').onclick; action(); action(); });
  assert.equal(await page.evaluate(() => qa.calls.length - qa.before), 1);
  await page.evaluate(() => { qa.hold = false; qa.release(); }); await button('Get read-only quote').waitFor();
  await mkdir('artifacts/ui', { recursive: true });
  await page.screenshot({ path: 'artifacts/ui/dex-review-1440.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'artifacts/ui/dex-review-390.png', fullPage: true });
  const beforeExpiryCalls = await page.evaluate(() => qa.calls.length);
  await page.evaluate(() => qa.clock += 16000);
  await page.getByText('QUOTE EXPIRED — request and review a new quote manually.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => qa.calls.length), beforeExpiryCalls);
  await page.evaluate(() => qa.records[0].status = 'UNKNOWN');
  await button('Refresh status').click();
  assert.equal(await button('Get read-only quote').isDisabled(), true);
  assert.equal(await button('Cancel / new intent').isDisabled(), true);
  await page.evaluate(() => { qa.records[0].status = 'FAILED'; qa.terminal = true; });
  await button('Refresh status').click(); await quote();
  await page.getByRole('alert').filter({ hasText: 'REJECTED_BEFORE_SIGNING' }).waitFor();
  assert.equal(await page.locator('[data-review]').isVisible(), false);
  assert.equal(await page.evaluate(() => qa.calls.some(x => /prepare|confirm|submit/.test(x.path))), false);
  assert.equal(realApi, 0);
  await page.evaluate(() => qa.mount.destroy());
  await page.evaluate(async()=>{
    const {mountControlledSwap}=await import('/app/controlled-swap-ui.js');
    window.productionFixture={calls:[],signerCalls:0,broadcastCalls:0,reconciles:0,status:{enabled:true,prepareEnabled:true,acceptanceEligible:true,signingArmed:false,liveEnabled:false,autonomousKillSwitch:true,realMoneyEmergencyStop:true,currentExecutionId:'historical-failure',records:[{id:'historical-failure',status:'REJECTED_BEFORE_SIGNING',reason:'QUOTE_UNAVAILABLE'}]}};
    const api=async(path,opts={})=>{
      if(path.endsWith('/controlled-swap'))throw Error('Legacy quote route unavailable');
      if(path.endsWith('/controlled-execution')){
        if(productionFixture.status.records[0]?.status==='SUBMITTED'){productionFixture.reconciles++;productionFixture.status.records[0].status='CONFIRMED';}
        return productionFixture.status;
      }
      if(path.endsWith('/controlled-execution/prepare')){
        productionFixture.calls.push({action:'prepare',body:JSON.parse(opts.body)});
        const prepared={id:'fixture-prepared',status:'PREPARED',messageHash:'a'.repeat(64),usdcDecimals:6,review:{totalProtectedLamports:'2020000',agentBalanceLamports:'6995000',peakAvailableAfterLamports:'3908120'},inputAmount:'100000',estimatedOutput:'12250',minimumOutput:'12127',slippageBps:100,pool:'fixture-pool',networkFeeLamports:'5000',networkFeeCapLamports:'10000',ataRentLamports:'2976880',quoteReference:'fixture-quote',expiresAt:Date.now()+25000};
        productionFixture.status.currentExecutionId=prepared.id;
        productionFixture.status.acceptanceEligible=false;
        productionFixture.status.records=[prepared,...productionFixture.status.records];
        productionFixture.status.armEligibility={executionId:prepared.id,eligible:true,reason:null};
        return {...prepared,confirmationToken:'fixture-capability'};
      }
      if(path.endsWith('/fixture-prepared/arm')){productionFixture.calls.push({action:'arm'});productionFixture.status.signingArmed=true;productionFixture.status.armedExecutionId='fixture-prepared';productionFixture.status.armEligibility={executionId:'fixture-prepared',eligible:false,reason:'ONE_SHOT_ALREADY_ACTIVE'};return {executionId:'fixture-prepared',status:'ARMED'};}
      if(path.endsWith('/fixture-prepared/confirm')){productionFixture.calls.push({action:'confirm',body:JSON.parse(opts.body)});productionFixture.signerCalls++;productionFixture.broadcastCalls++;productionFixture.status.records[0].status='SUBMITTED';productionFixture.status.signingArmed=false;productionFixture.status.armedExecutionId=null;return {id:'fixture-prepared',status:'SUBMITTED'};}
      throw Error('Unexpected route');
    };
    productionFixture.remount=()=>{window.productionMount?.destroy();window.productionMount=mountControlledSwap(document.querySelector('#dex'),{id:'fixture-agent',name:'Fixture agent'},{api,newKey:()=> 'fixture-one-key'});};
    window.productionMount=mountControlledSwap(document.querySelector('#dex'),{id:'fixture-agent',name:'Fixture agent'},{api,newKey:()=> 'fixture-one-key'});
  });
  await page.locator('summary').click();
  const prepareReview=button('Prepare 0.0001 SOL → USDC review');
  await prepareReview.waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('[data-dex=prepare]').disabled);
  assert.equal(await prepareReview.isEnabled(),true);
  assert.equal(await button('CONFIRM CONTROLLED BUY').isDisabled(),true);
  assert.equal(await page.getByLabel('Explicit token mint').count(),0);
  assert.equal(await page.getByText('Preparation and confirmation are unavailable until an independently validated provider route is implemented.').count(),0);
  assert.equal(await page.getByText('Server-locked acceptance: BUY 0.0001 SOL → USDC. Mint, pool, amount and slippage are fixed by server policy.').count(),1);
  assert.equal(await page.evaluate(()=>productionFixture.calls.length),0);
  await prepareReview.click();
  assert.deepEqual(await page.evaluate(()=>productionFixture.calls),[{action:'prepare',body:{direction:'BUY',inputMint:'So11111111111111111111111111111111111111112',outputMint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',inputAmount:'100000',slippageBps:100,requestKey:'fixture-one-key'}}]);
  assert.equal(await prepareReview.isDisabled(),true);
  assert.equal((await page.locator('#dex').textContent()).includes('fixture-capability'),false);
  assert.equal(await page.evaluate(()=>[...Object.values(localStorage),...Object.values(sessionStorage)].some(value=>value.includes('fixture-capability'))),false);
  await page.evaluate(()=>productionMount.refresh());
  assert.equal(await button('Arm this reviewed execution').isEnabled(),true);
  await page.evaluate(()=>productionFixture.remount());
  await page.locator('#dex details').first().evaluate(node=>node.open=true);
  assert.equal(await button('Arm this reviewed execution').isEnabled(),true);
  assert.equal(await button('CONFIRM CONTROLLED BUY').isDisabled(),true);
  await page.evaluate(async()=>{
    const original=productionFixture.status.records[0];
    productionFixture.status.records.unshift({...original,id:'other-execution'});
    productionFixture.status.currentExecutionId='other-execution';
    productionFixture.status.armEligibility={executionId:'other-execution',eligible:true,reason:null};
    await productionMount.refresh();
  });
  assert.equal(await page.locator('#dex [data-dex=arm]').isDisabled(),true);
  await page.getByText('CAPABILITY_MISSING — this browser session no longer holds the one-time confirmation capability for this execution. No signing was requested.').waitFor({state:'attached'});
  await page.evaluate(async()=>{
    productionFixture.status.records.shift();
    productionFixture.status.currentExecutionId='fixture-prepared';
    productionFixture.status.armEligibility={executionId:'fixture-prepared',eligible:true,reason:null};
    await productionMount.refresh();
  });
  await page.locator('#dex details').first().evaluate(node=>node.open=true);
  assert.equal(await button('Arm this reviewed execution').isEnabled(),true);
  await page.evaluate(()=>{const action=document.querySelector('[data-dex=arm]').onclick;action();action();});
  await page.getByText('ARMED FOR ONE MANUAL CONFIRMATION').waitFor();
  assert.equal(await button('Arm this reviewed execution').isDisabled(),true);
  assert.equal(await button('CONFIRM CONTROLLED BUY').isEnabled(),true);
  assert.deepEqual(await page.evaluate(()=>productionFixture.calls.map(x=>x.action)),['prepare','arm']);
  await page.evaluate(()=>{const action=document.querySelector('[data-dex=confirm]').onclick;action();action();});
  assert.equal(await button('CONFIRM CONTROLLED BUY').isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>productionFixture.calls.map(x=>x.action)),['prepare','arm','confirm']);
  assert.deepEqual(await page.evaluate(()=>[productionFixture.signerCalls,productionFixture.broadcastCalls,productionFixture.reconciles,productionFixture.status.signingArmed,productionFixture.status.records[0].status]),[1,1,1,false,'CONFIRMED']);
  assert.equal(realApi,0);
  await page.evaluate(()=>productionMount.destroy());
  await page.evaluate(async()=>{
    const {mountControlledSwap}=await import('/app/controlled-swap-ui.js');
    const status={enabled:true,prepareEnabled:true,acceptanceEligible:true,signingArmed:false,liveEnabled:false,autonomousKillSwitch:true,records:[]};
    const api=async(path,opts={})=>{
      if(path.endsWith('/controlled-swap'))throw Error('Legacy unavailable');
      if(path.endsWith('/controlled-execution/prepare')){
        const {requestKey}=JSON.parse(opts.body);
        status.currentExecutionId='rejected-fixture';
        status.records=[{id:'rejected-fixture',requestKey,status:'REJECTED_BEFORE_SIGNING',reason:'QUOTE_UNAVAILABLE',quoteDiagnostic:{code:'STATE_STALE'},signature:null}];
        throw Error('Rejected before signing');
      }
      if(path.endsWith('/controlled-execution'))return status;
      throw Error('Unexpected route');
    };
    window.rejectedMount=mountControlledSwap(document.querySelector('#dex'),{id:'fixture-agent',name:'Fixture agent'},{api,newKey:()=> 'fixture-rejected-key'});
  });
  await page.locator('summary').click();
  await page.waitForFunction(()=>!document.querySelector('[data-dex=prepare]').disabled);
  await button('Prepare 0.0001 SOL → USDC review').click();
  await page.getByRole('alert').filter({hasText:'Preparation rejected before signing · QUOTE_UNAVAILABLE · STATE_STALE'}).waitFor();
  assert.equal(await page.getByText('outcome unknown').count(),0);
  assert.equal(await button('CONFIRM CONTROLLED BUY').isDisabled(),true);
  await page.evaluate(()=>rejectedMount.destroy());
  await page.evaluate(async()=>{
    const {mountControlledSwap}=await import('/app/controlled-swap-ui.js');
    const prepared={id:'prepared-B',status:'PREPARED',usdcDecimals:6,expiresAt:Date.now()+60000,inputAmount:'100000',estimatedOutput:'12290',minimumOutput:'12167',slippageBps:100,pool:'fixture-pool',messageHash:'b'.repeat(64),networkFeeLamports:'5000',networkFeeCapLamports:'10000',ataRentLamports:'2976880',review:{totalProtectedLamports:'2020000',agentBalanceLamports:'6995000',peakAvailableAfterLamports:'3908120'}};
    const rejected={id:'rejected-A',status:'REJECTED_BEFORE_SIGNING',reason:'QUOTE_UNAVAILABLE',quoteDiagnostic:{code:'STATE_STALE'}};
    const status={enabled:true,prepareEnabled:true,acceptanceEligible:false,signingArmed:false,liveEnabled:false,autonomousKillSwitch:true,currentExecutionId:prepared.id,armEligibility:{executionId:prepared.id,eligible:false,reason:'BLOCKHASH_EXPIRED'},records:[rejected,prepared]};
    window.scopedStatus=status;
    const api=async(path)=>path.endsWith('/controlled-execution')?status:Promise.reject(Error('Legacy unavailable'));
    window.scopedMount=mountControlledSwap(document.querySelector('#dex'),{id:'fixture-agent',name:'Fixture agent'},{api});
  });
  await page.locator('summary').first().click();
  await page.getByText('Execution prepared-B').waitFor();
  assert.equal(await page.getByRole('alert').filter({hasText:'STATE_STALE'}).count(),0);
  await page.getByText('Arm unavailable for this execution: BLOCKHASH_EXPIRED. No signing was requested.').waitFor();
  assert.equal(await page.locator('#dex [data-dex=arm]').isDisabled(),true);
  await page.evaluate(async()=>{scopedStatus.armEligibility={executionId:'prepared-B',eligible:true,reason:null};await scopedMount.refresh();});
  await page.getByText('CAPABILITY_MISSING — this browser session no longer holds the one-time confirmation capability for this execution. No signing was requested.').waitFor({state:'attached'});
  assert.equal(await page.locator('#dex [data-dex=arm]').isDisabled(),true);
  await page.evaluate(async()=>{scopedStatus.currentExecutionId='rejected-A';await scopedMount.refresh();});
  await page.locator('#dex p[role="alert"]').filter({hasText:'QUOTE_UNAVAILABLE · STATE_STALE'}).waitFor({state:'attached'});
  assert.equal(await page.getByText('Execution prepared-B').count(),0);
  assert.equal(await page.locator('#dex [data-dex=arm]').isDisabled(),true);
  await page.evaluate(async()=>{scopedStatus.currentExecutionId='prepared-B';scopedStatus.records.find(r=>r.id==='prepared-B').status='EXPIRED';await scopedMount.refresh();});
  await page.locator('#dex .tw-dex-warning').filter({hasText:'EXPIRED — REVIEW ONLY'}).waitFor({state:'attached'});
  assert.equal(await page.locator('#dex [data-dex=arm]').isDisabled(),true);
  await page.evaluate(()=>scopedMount.destroy());
  console.log('PASS controlled UI: fixed intent, capability continuity through refresh/remount, execution isolation, double-click protection, one fixture sign/send/reconcile; no real API.');
} finally { await browser.close(); await server.close(); }
