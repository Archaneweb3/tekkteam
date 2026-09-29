import {DatabaseSync} from 'node:sqlite';
import {chromium} from 'playwright';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {renderAgentOverview} from '../public/app/agent-overview-ui.js';

const id='0f406135-35ea-437d-a27c-29052d279c3b';
const db=new DatabaseSync('server/data/tekkwork.sqlite',{readOnly:true});
const rows=db.prepare('SELECT data FROM paper_portfolio_history WHERE agent_id=? ORDER BY timestamp').all(id).map(row=>JSON.parse(row.data));
db.close();
assert.ok(rows.length>1,'Real LPAD TEST history must exist');
const valid=rows.filter(row=>typeof row.portfolioValueSol==='number'&&Number.isFinite(row.portfolioValueSol));
const last=valid.at(-1);
const html=renderAgentOverview({t:{status:'PAUSED',activity:[],openPositions:[]},a:{summary:{paperStartingCapitalSol:.1,portfolioValueSol:last.portfolioValueSol,totalPnlSol:last.portfolioValueSol-.1,unrealizedPnlSol:0,roiPercent:(last.portfolioValueSol/.1-1)*100},portfolioHistory:rows},d:null});
let segments=0,previous=null;for(const row of rows){if(typeof row.portfolioValueSol!=='number'){previous=null;continue;}if(previous===null||row.timestamp-previous>600000)segments++;previous=row.timestamp;}
assert.equal((html.match(/class="ao-line"/g)||[]).length+(html.match(/data-ao-isolated/g)||[]).length,segments,'All real continuous segments rendered independently');
assert.equal((html.match(/class="ao-area"/g)||[]).length,0,'No broken segmented area fills');
assert.equal((html.match(/class="ao-axis ao-axis-x"/g)||[]).length,3,'Compact time axis uses actual recorded range');
assert.ok(html.includes(last.portfolioValueSol.toLocaleString('en-US',{maximumFractionDigits:6})),'Endpoint reflects latest valid sample');
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:5188/');
  await page.evaluate(markup=>{document.body.innerHTML=`<main style="max-width:1250px;margin:auto;padding:24px;background:#07152e">${markup}</main>`;},html);
  await page.screenshot({path:join(tmpdir(),`tekkwork-real-lpad-chart-${width}.png`),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`No chart overflow at ${width}px`);
  await page.close();
 }
}finally{await browser.close();}
console.log(JSON.stringify({samples:rows.length,valid:valid.length,nulls:rows.length-valid.length,segments,lastValue:last.portfolioValueSol}));
