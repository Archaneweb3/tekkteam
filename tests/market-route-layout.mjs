import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {publicConfig} from '../server/config.js';

const base=process.env.BASE_URL||'http://127.0.0.1:5188';
const browser=await chromium.launch({headless:true});
const routes=['overview','agents','tokens','traders','leaderboard','payroll','how'];
try{
 for(const width of [1440,1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   const data=path==='/api/state'?{config:publicConfig('devnet'),session:null,agents:[],events:[],coins:[],feed:[],tokens:[],bonded:[],stats:{}}:path==='/api/health'?{ok:true}:{agents:[],history:[],positions:[],status:'Unavailable'};
   return route.fulfill({json:data});
  });
  const navigate=async name=>{
   await page.evaluate(name=>{location.hash='#/'+name;},name);
   await page.waitForFunction(name=>document.body.dataset.route===name&&!!document.querySelector('#tw-page')?.firstElementChild,name);
   return page.evaluate(()=>{
    const root=document.querySelector('#tw-page'),child=root.firstElementChild,rect=child.getBoundingClientRect(),style=getComputedStyle(child);
    return {x:rect.x,width:rect.width,fontSize:style.fontSize,rootClass:root.className,rootDisplay:getComputedStyle(root).display,htmlClass:document.documentElement.className,bodyClass:document.body.className,htmlStyle:document.documentElement.style.cssText,bodyStyle:document.body.style.cssText};
   });
  };
  await page.goto(base+'/#/overview');
  for(const name of routes){
   const before=await navigate(name);
   await navigate('market');
   const after=await navigate(name);
   assert.deepEqual(after,before,`${width}px ${name} shell changed after Market`);
   assert.equal(after.rootClass,'',`${width}px ${name} inherited Market classes`);
  }
  for(const name of ['market','tokens','market','payroll','market','leaderboard']){
   const result=await navigate(name);
   if(name!=='market')assert.equal(result.rootClass,'',`${width}px repeated navigation retained Market classes`);
  }
  await page.close();
 }
 console.log('Market route shell stable at 1440, 1280 and 390px.');
}finally{await browser.close();}
