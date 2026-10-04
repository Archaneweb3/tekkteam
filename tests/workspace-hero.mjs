import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {publicConfig} from '../server/config.js';
import {mkdirSync} from 'node:fs';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
mkdirSync('artifacts/solid-hero',{recursive:true});
const browser=await chromium.launch();
try{
 for(const width of [1440,1280,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;if(r.request().method()!=='GET'){writes.push(p);return r.abort();}return r.fulfill({json:p==='/api/state'?{session:null,agents:[],config:publicConfig('devnet'),events:[],stats:{}}:p.includes('/network')?{agents:[],activity:[],overview:{activeTraders:0,openPositions:0,totalPaperPnlSol:0}}:{agents:[]}});});
  await page.goto('http://127.0.0.1:5188/#/overview');await page.locator('.phone-empty').getByText('No Paper activity yet.',{exact:false}).waitFor();
  assert.equal(await page.locator('#tw-office canvas').count(),1);assert.equal(await page.locator('.workforce-roles article').count(),3);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await page.evaluate(()=>document.querySelector('.workforce-visual').getBoundingClientRect().bottom<=document.querySelector('.desk-heading').getBoundingClientRect().top));
  assert.equal(await page.locator('.tw-header').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
  assert.equal(await page.locator('.glass-hero-actions a.primary').getAttribute('href'),'#/launch');
  assert.equal(await page.locator('.glass-hero-actions a:not(.primary)').getAttribute('href'),'#/agents');
  await page.screenshot({path:`artifacts/solid-hero/empty-${width}.png`,fullPage:true});
  // Only the presentation adapter is exercised with fixtures; no engine or trading calls.
  await page.evaluate(async()=>{const{paintDevice}=await import('/app/workspace-device.js');paintDevice(document.querySelector('.ov-workspace-hero'),{agents:[{agentId:'fixture',name:'Fixture Agent'}],activity:[{agentId:'fixture',type:'BUY',tokenSymbol:'QA',executedSizeSol:.001}]});});
  await page.locator('.phone-events').getByText('Fixture Agent').waitFor();assert.match(await page.locator('.phone-events').innerText(),/BUY.*\$QA/s);
  await page.screenshot({path:`artifacts/solid-hero/fixture-${width}.png`,fullPage:true});
  await page.evaluate(async()=>{const{paintDevice}=await import('/app/workspace-device.js');paintDevice(document.querySelector('.ov-workspace-hero'),null);});await page.locator('.phone-empty').getByText('Feed unavailable').waitFor();
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.workforce-phone').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);console.log(`PASS ${width}: composition, one map canvas, device empty/populated/error, CTA routes, reduced motion, no writes/errors`);await page.close();
 }
}finally{await browser.close();}
