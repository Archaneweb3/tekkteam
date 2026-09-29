import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publicConfig} from '../server/config.js';

const base=process.env.BASE_URL||'http://127.0.0.1:5188';
const owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
const browser=await chromium.launch();
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{
   if(route.request().method()!=='GET'){writes.push(route.request().url());return route.abort();}
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/state')return route.fulfill({json:{session:{address:owner},agents:[],events:[],stats:{},config:publicConfig('devnet')}});
   return route.fulfill({status:404,json:{error:'Not needed for isolated creation fixture'}});
  });
  await page.goto(base+'/#/agents/new');
  await page.locator('#tw-create').waitFor();
  assert.equal(await page.locator('.ca-step:not([hidden])').getAttribute('data-step'),'1');
  await page.locator('[data-next="2"]').click();
  assert.equal(await page.locator('[data-error-for="name"]').textContent(),'Enter an Agent name (2–40 characters).');
  await page.locator('[name="name"]').fill('Nora Test');
  await page.locator('[name="tokenName"]').fill('Nora Token');
  await page.locator('[name="ticker"]').fill('NORA');
  await page.locator('input[name="character"][value="cupsey"]').check({force:true});
  assert.match(await page.locator('[data-character-name]').textContent(),/Nora/);
  await page.locator('.tw-token-image img').waitFor({state:'visible',timeout:15000});
  assert.equal(await page.locator('.tw-token-image [data-replace]').isVisible(),true,'Upload/replace control remains available');
  await page.locator('[data-next="2"]').click();
  assert.equal(await page.locator('.ca-step:not([hidden])').getAttribute('data-step'),'2');
  await page.locator('[data-profile="selective"]').click();
  assert.equal(await page.locator('[name="strategy"]').inputValue(),'selective');
  await page.locator('[data-next="3"]').click();
  assert.equal(await page.locator('[data-review-name]').textContent(),'Nora Test');
  assert.equal(await page.locator('[data-review-profile]').textContent(),'CONSERVATIVE');
  await page.locator('[data-back="2"]').click();
  assert.equal(await page.locator('[data-profile="selective"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-back="1"]').click();
  assert.equal(await page.locator('[name="ticker"]').inputValue(),'NORA');
  assert.equal(await page.locator('input[name="character"]:checked').inputValue(),'cupsey');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`Horizontal overflow at ${width}`);
  if(process.env.CREATE_AGENT_SCREENSHOTS){
   await page.screenshot({path:join(tmpdir(),`tekkwork-create-agent-${width}-identity.png`),fullPage:true});
   await page.locator('[data-next="2"]').click();await page.screenshot({path:join(tmpdir(),`tekkwork-create-agent-${width}-trading.png`),fullPage:true});
   await page.locator('[data-next="3"]').click();await page.screenshot({path:join(tmpdir(),`tekkwork-create-agent-${width}-review.png`),fullPage:true});
  }
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('Create Agent identity, profile, review, back-state and 1440/390 layout passed.');
}finally{await browser.close();}
