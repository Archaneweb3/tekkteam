// Read-only frontend fixtures: no wallet, signing, broadcast, or application data changes.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const base='http://127.0.0.1:5188';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const agent={agentId:'fixture-agent',name:'Fixture worker',character:'frank',status:'WORKING',strategy:'momentum',tokenSymbol:'FIX',paperStartingCapitalSol:.1,portfolioValueSol:.11,realizedPnlSol:.01,totalPnlSol:.01,roiPercent:10,closedPositionCount:3,winRate:66.7,openPositions:[],activity:[]};
 const event={eventId:'fixture-buy',agentId:agent.agentId,type:'BUY',tokenSymbol:'FIX',reason:'Entry checks passed',strategy:'momentum',timestamp:Date.now()};
 await page.route('**/api/trading/network',route=>route.fulfill({json:{agents:[agent],overview:{activeTraders:1,openPositions:0,tradesToday:1,totalPaperPnlSol:.01},activity:[event]}}));
 await page.route('**/api/trading/leaderboard**',route=>route.fulfill({json:{agents:[{...agent,rank:1}]}}));
 await page.goto(base+'/#/traders');
 await page.getByRole('heading',{name:'WATCH YOUR AGENTS WORK THE MARKET.'}).waitFor();
 await page.locator('.tw-floor-event-reason').getByText('Entry checks passed').waitFor();
 await page.getByRole('button',{name:'BUYS'}).click();
 assert.equal(await page.locator('.tw-floor-event').count(),1);
 await page.getByRole('button',{name:'SELLS'}).click();
 assert.equal(await page.locator('.tw-floor-event').count(),0);
 await page.goto(base+'/#/leaderboard');
 await page.getByText('NOT ENOUGH COMPETITION YET').waitFor();
 assert.equal(await page.locator('.tw-floor-podium-place').count(),0);
 await page.locator('[data-sort]').selectOption('roi');
 await page.route('**/api/state',async route=>{const response=await route.fetch();const data=await response.json();await route.fulfill({json:{...data,session:{address:'fixture-owner'}}});});
 await page.route('**/api/trading/payroll',route=>route.fulfill({json:{agents:[agent]}}));
 await page.goto(base+'/#/payroll');
 await page.getByText('PAPER WORKFORCE').waitFor();
 assert.equal(await page.locator('.tw-floor-capital > a').count(),1);
 assert.match(await page.locator('[data-results]').innerText(),/0.1 SOL/);
 assert.match(await page.locator('[data-results]').innerText(),/CREATOR FEES[\s\S]*—/);
 await page.goto(base+'/#/how');
 await page.getByRole('button',{name:/PAPER VS REAL/}).click();
 assert.equal(new URL(page.url()).hash,'#/how');
 await page.getByRole('dialog').getByRole('button',{name:'Close guide'}).click();
 await page.getByText('What is Paper Trading?').click();
 assert.equal(await page.locator('.tw-guide-faq details[open]').count(),1);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  for(const route of ['traders','leaderboard','payroll','how']){
   await page.goto(base+'/#/'+route);
   await page.locator('.tw-world-hero').waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${route} overflow at ${width}px`);
  }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS Trading filters, low-data leaderboard, Guide navigation/FAQ, and four pages at 1440/390.');
}finally{await browser.close();}
