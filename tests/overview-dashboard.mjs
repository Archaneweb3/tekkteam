import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const agents=Array.from({length:7},(_,i)=>({agentId:'fixture-'+i,name:'Agent '+i,character:['frank','sage','bolt','ember','chief'][i%5],createdAt:Date.now()-i*60000,launchToken:{name:'Token '+i,symbol:'T'+i},status:i?'PAUSED':'WORKING',strategy:'momentum',paperStartingCapitalSol:.1,portfolioValueSol:.12,totalPnlSol:.02,roiPercent:20-i,tradeCount:2,wins:1,losses:0,winRate:100,openPositions:[],activity:[]}));
 const activity=[{eventId:'buy',agentId:'fixture-0',type:'BUY',executedSizeSol:.01,tokenSymbol:'SOL',reason:'Momentum threshold passed',timestamp:Date.now()},{eventId:'sell',agentId:'fixture-1',type:'SELL',timestamp:Date.now(),reason:'Target reached'}];
 await page.route('**/api/trading/**',route=>route.fulfill({json:route.request().url().includes('network')?{agents,activity,overview:{activeTraders:1,openPositions:0,totalPaperPnlSol:.14}}:{agents}}));
 await page.goto('http://127.0.0.1:5188/#/overview');await page.getByRole('heading',{name:'Workforce overview',exact:true}).waitFor();await page.getByText('Momentum threshold passed').waitFor();
 assert.deepEqual(await page.locator('nav[aria-label="Main navigation"] a').allTextContents(),['Overview','Agents','Tokens','Characters','Guide']);
 for(const width of [1440,1280,390]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(800);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.locator('#tw-office canvas').count(),1);assert.ok((await page.locator('#tw-office').boundingBox()).height>=350);assert.ok(await page.evaluate(()=>document.querySelector('.ov-workspace-hero').getBoundingClientRect().bottom<=document.querySelector('.tw-network-strip').getBoundingClientRect().top));await page.screenshot({path:`overview-${width}.png`,fullPage:true});}
 await page.locator('#tw-office [data-role="trade"]').click();await page.waitForTimeout(700);assert.ok((await page.locator('.tw-overview-feed').boundingBox()).y<200);assert.equal(await page.locator('#tw-office canvas').count(),1);
 await page.locator('#tw-office [data-role="how"]').click();await page.waitForURL('**/#/how');await page.getByRole('heading',{name:'Workspace guide',exact:true}).waitFor();assert.equal(await page.locator('#tw-office canvas').count(),0);await page.goto('http://127.0.0.1:5188/#/overview');await page.getByText('Momentum threshold passed').waitFor();
 await page.locator('[data-feed-filter="sells"]').click();assert.equal(await page.getByText('Momentum threshold passed').count(),0);await page.getByText('Target reached').waitFor();
 await page.locator('[data-sort="pnl"]').click();await page.waitForTimeout(100);assert.equal(await page.locator('[data-sort="pnl"]').getAttribute('aria-pressed'),'true');
 // Owner payroll rendering in isolation without authenticating or modifying user state.
 await page.evaluate(async()=>{const {mountOverview}=await import('/app/overview-dashboard.js');window.fixtureOverview=mountOverview(document.querySelector('main'),{getSession:()=> 'fixture-owner'});});
 await page.locator('.ov-payroll-grid .tw-agent').first().waitFor();assert.equal(await page.locator('.ov-payroll-grid .tw-agent').count(),7);
 assert.deepEqual(errors,[]);console.log('PASS Overview navigation, shared fixtures, filters, payroll, 1440/1280/390 and no browser errors');
}finally{await browser.close();}
