import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {publicConfig} from '../server/config.js';
import sharp from 'sharp';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';let session={address:owner},agents=[],fail=false,delay=false,release,writes=0;
 await page.route('**/api/**',async route=>{
  if(route.request().method()!=='GET'){writes++;return route.abort();}
  if(new URL(route.request().url()).pathname!=='/api/state')return route.abort();
  if(delay)await new Promise(r=>release=r);
  return route.fulfill(fail?{status:503,json:{error:'API unavailable'}}:{json:{session,agents,config:publicConfig('devnet'),events:[],stats:{}}});
 });
 await page.goto('http://127.0.0.1:5188/#/launch');await page.getByText('Create an agent first to launch a token.',{exact:true}).waitFor();assert.equal(await page.locator('#tw-launch-connect').count(),0);
 await page.locator('#tw-create-agent').click();await page.waitForURL('**/#/agents/new');assert.equal(await page.locator('dialog').count(),0);
 for(const width of [1440,1280,390]){await page.setViewportSize({width,height:1000});await page.waitForFunction(()=>document.querySelectorAll('.tw-character-choice img[data-ready="true"]').length===5);assert.equal(await page.locator('select[name="character"]').count(),0);await page.locator('.tw-character-option').last().click();assert.equal(await page.locator('#tw-create').evaluate(f=>new FormData(f).get('character')),'satoshi');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('.tw-character-option').last().hover();await page.waitForTimeout(220);assert.equal(await page.locator('.tw-character-option').last().locator('.tw-character-choice').evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(231, 201, 93)');assert.equal(await page.locator('.tw-character-check svg').first().evaluate(el=>getComputedStyle(el).width),'18px');await page.screenshot({fullPage:true,path:`create-picker-${width}.png`});await page.locator('.tw-character-option').first().hover();await page.waitForTimeout(220);assert.equal(await page.locator('.tw-character-choice').first().evaluate(el=>getComputedStyle(el).backgroundImage),'none');await page.screenshot({fullPage:true,path:`create-picker-hover-${width}.png`});}
 const image=await sharp({create:{width:40,height:80,channels:3,background:'#e0aa50'}}).png().toBuffer();
 await page.locator('.tw-token-image [type=file]').setInputFiles({name:'token.png',mimeType:'image/png',buffer:image});await page.waitForFunction(()=>!document.querySelector('.tw-token-drop img').hidden);assert.match(await page.locator('.tw-token-drop img').getAttribute('src'),/^data:image\/png/);
 await page.locator('[data-remove]').click();assert.equal(await page.locator('.tw-token-drop img').isVisible(),false);
 await page.locator('[data-character-image]').check();await page.waitForFunction(()=>!document.querySelector('.tw-token-drop img').hidden);const before=await page.locator('.tw-token-drop img').getAttribute('src');await page.locator('.tw-character-option').first().click();await page.waitForFunction(old=>document.querySelector('.tw-token-drop img').src!==old,before);assert.equal(await page.locator('input[name=character]:checked').inputValue(),'frank');
 await page.screenshot({fullPage:true,path:'token-image-mobile.png'});await page.setViewportSize({width:1440,height:1000});await page.screenshot({fullPage:true,path:'token-image-desktop.png'});
 await page.goto('http://127.0.0.1:5188/#/launch');
 session=null;await page.reload();await page.locator('#tw-launch-connect').waitFor();assert.equal(await page.getByText('No agents yet',{exact:true}).count(),0);
 session={address:owner};agents=[{id:'one',name:'Real Agent',creator:owner,character:'frank',coin:{name:'Real Token',ticker:'REAL'},status:'DRAFT',strategy:'selective'}];await page.reload();await page.locator('.tw-agent').waitFor();assert.match(await page.locator('.tw-agent').innerText(),/Real Agent/i);assert.equal(await page.locator('.tw-agent').getAttribute('href'),'#/agent/one');
 await page.goto('http://127.0.0.1:5188/#/agents');fail=true;await page.goto('http://127.0.0.1:5188/#/launch');await page.getByText('Could not load agents',{exact:true}).waitFor();assert.equal(await page.getByText('No agents yet',{exact:true}).count(),0);
 fail=false;delay=true;await page.locator('#tw-launch-retry').click();await page.getByText('Loading your agents…',{exact:true}).waitFor();while(!release)await page.waitForTimeout(20);delay=false;release();await page.locator('.tw-agent').waitFor();assert.equal(writes,0);
 console.log('PASS: canonical connected/empty, disconnected, owner agents, loading, error/retry, create form; no wallet or write requests.');
}finally{await browser.close();}
