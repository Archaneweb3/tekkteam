import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {publicConfig} from '../server/config.js';

const owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
const agent={id:'assignment-fixture',name:'LPAD TEST',creator:owner,character:'frank',strategy:'balanced',coin:{name:'launch test',ticker:'LCHT'},status:'DRAFT'};
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});let writes=0;
  page.on('pageerror',error=>{throw error;});
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/state')return route.fulfill({json:{config:publicConfig('devnet'),session:{address:owner},agents:[agent],events:[],stats:{}}});
   if(path==='/api/agents/'+agent.id&&route.request().method()==='GET')return route.fulfill({json:{...agent,no:1,createdAt:Date.now()}});
   if(path==='/api/agents/'+agent.id+'/character'){
    writes++;const body=route.request().postDataJSON();
    assert.deepEqual(body,{character:'cupsey',expectedCharacter:'frank'});
    return route.fulfill({json:{...agent,character:'cupsey'}});
   }
   return route.fulfill({status:404,json:{error:'Fixture route unavailable'}});
  });
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:5188')+'/#/agent/'+agent.id);
  assert.equal(await page.locator('[data-nav="skins"]').count(),0);
  assert.equal(await page.locator('[data-nav="market"]').count(),1);
  await page.getByRole('tab',{name:'Settings'}).click();
  assert.equal(await page.getByRole('link',{name:'CHOOSE CHARACTER →'}).count(),1);
  await page.getByRole('link',{name:'CHOOSE CHARACTER →'}).click();
  assert.match(page.url(),/#\/skins$/);
  await page.getByRole('link',{name:'CHOOSE CHARACTER →'}).first().click();
  assert.match(page.url(),/#\/skins\/assign\/cupsey$/);
  assert.match(await page.locator('.tw-character-assign h1').innerText(),/ASSIGN CHARACTER/);
  assert.equal(writes,0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.getByRole('button',{name:'ASSIGN TO LPAD TEST →'}).click();
  assert.equal(writes,0);
  await page.getByRole('button',{name:'CANCEL'}).click();
  assert.equal(writes,0);
  await page.getByRole('button',{name:'ASSIGN TO LPAD TEST →'}).click();
  await page.getByRole('button',{name:'ASSIGN CHARACTER',exact:true}).dblclick();
  await page.getByText('Nora Signal is now assigned to LPAD TEST.').waitFor();
  assert.equal(writes,1);
  await page.close();
 }
 console.log('Character assignment browser flow passed at 1440px and 390px.');
}finally{await browser.close();}
