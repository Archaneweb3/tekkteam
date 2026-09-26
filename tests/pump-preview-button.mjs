import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const fixture=JSON.parse(fs.readFileSync('docs/pump-simulation-2026-09-26.json','utf8'));
const browser=await chromium.launch({headless:true});
try{
 for(const mode of ['missing','connected-stale','disconnected']){
  const page=await browser.newPage();const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.route('http://127.0.0.1:4192/prepare',route=>route.fulfill({status:200,contentType:'application/x-ndjson',headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:5188'},body:JSON.stringify({result:fixture})+'\n'}));
  await page.addInitScript(mode=>{
   sessionStorage.setItem('pump-preview-used','true');
   window.walletMethodCalls=0;
   if(mode!=='missing')window.phantom={solana:{isPhantom:true,isConnected:mode==='connected-stale',publicKey:mode==='connected-stale'?{toBase58:()=> 'ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS'}:null,connect(){window.walletMethodCalls++;throw Error('Forbidden');},signTransaction(){window.walletMethodCalls++;throw Error('Forbidden');}}};
  },mode);
  await page.goto('http://127.0.0.1:5188/pump-preview.html');
  await page.waitForFunction(()=>document.querySelector('#boot').textContent.startsWith('Script and module imports loaded'));
  assert.equal(await page.locator('#go').getAttribute('data-listener-attached'),'true');
  assert.equal(await page.locator('#go').evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}),true);
  await page.locator('#go').click();
  await page.waitForFunction(()=>document.querySelector('#evidence').textContent.includes('FLOW_STOPPED'));
  const text=await page.locator('#evidence').textContent();
  assert.ok(text.includes('BUTTON_CLICKED'));assert.ok(text.includes('PHANTOM_PROVIDER_DETECTED'));
  assert.ok(text.includes(mode==='connected-stale'?'READY_FOR_PHANTOM_PREVIEW':'CLICK_HANDLER_FAILED'));
  if(mode!=='connected-stale')assert.ok(text.includes('stack'));
  assert.equal(await page.evaluate(()=>window.walletMethodCalls),0);
  assert.equal(await page.locator('#go').isDisabled(),true);
  assert.deepEqual(errors,[]);assert.ok(!requests.some(url=>url.includes('api.mainnet')));
  assert.equal(requests.filter(url=>url.includes(':4192/prepare')).length,mode==='connected-stale'?1:0);
  console.log('PASS',mode,'listener/imports/one-shot/mock-simulation/no-wallet-or-live-RPC');await page.close();
 }
}finally{await browser.close();}
