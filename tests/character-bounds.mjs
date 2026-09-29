import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {publicConfig} from '../server/config.js';

const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/state')return route.fulfill({json:{config:publicConfig('devnet'),session:{address:'fixture-owner'},agents:[],events:[],coins:[],feed:[],tokens:[],bonded:[],stats:{}}});
  return route.fulfill({status:404,json:{error:'Not used by character fixture'}});
 });
 async function bounds(selector){
  const result=await page.locator(selector).evaluate(host=>{
   const canvas=host.querySelector('canvas'),h=host.getBoundingClientRect(),c=canvas?.getBoundingClientRect();
   return {inside:!!c&&c.left>=h.left-1&&c.top>=h.top-1&&c.right<=h.right+1&&c.bottom<=h.bottom+1,width:c?.width,height:c?.height,hostWidth:h.width,hostHeight:h.height};
  });
  assert.ok(result.inside,JSON.stringify(result));
  assert.ok(Math.abs(result.width-result.hostWidth)<2&&Math.abs(result.height-result.hostHeight)<2);
 }
 for(const width of [1886,1440,768,390,320]){
  await page.setViewportSize({width,height:1000});
  await page.goto('http://127.0.0.1:5188/#/agents/new');
  await page.locator('#tw-create').waitFor();
  for(const id of ['frank','cupsey','fomy','alon','satoshi']){
   await page.locator(`#tw-create input[value="${id}"]`).check({force:true});
   assert.equal(await page.locator('#tw-create input[name="character"]:checked').inputValue(),id);
   const image=page.locator(`#tw-create label:has(input[value="${id}"]) img`);
   await image.waitFor();assert.equal(await image.getAttribute('data-character'),id);
  }
  await page.locator('#tw-create input[name="name"]').fill('Felix test');
  assert.equal(await page.locator('#tw-create input[name="name"]').inputValue(),'Felix test');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.goto('http://127.0.0.1:5188/#/skins');await page.locator('.tw-model canvas').first().waitFor();
  for(const id of ['frank','cupsey','fomy','alon','satoshi','diamond'])await bounds(`[data-model="${id}"]`);
 }
 assert.deepEqual(errors,[]);
 console.log('Five agent-form selections and all six gallery models remain usable and contained at five widths.');
}finally{await browser.close();}
