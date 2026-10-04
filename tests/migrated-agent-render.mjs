import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {chromium} from 'playwright';
import {publicConfig} from '../server/config.js';
import {projectTrading} from '../server/trading-projection.js';

const id='0f406135-35ea-437d-a27c-29052d279c3b';
const owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
const db=new DatabaseSync('migration-output/tekkwork.sqlite',{readOnly:true});
let agent;
try{
 const row=db.prepare('SELECT no,owner,data,secret IS NULL AS secret_null FROM agents WHERE id=?').get(id);
 assert.ok(row,'migrated LPAD TEST exists');
 assert.equal(row.owner,owner);
 assert.equal(row.secret_null,1,'Devnet mint secret was not migrated');
 assert.equal(db.prepare('SELECT count(*) AS n FROM agents').get().n,2);
 assert.equal(db.prepare('SELECT count(*) AS n FROM agents WHERE owner=?').get(owner).n,1,'Other owner Agent must not enter this roster');
 const other=db.prepare('SELECT owner,secret IS NULL AS secret_null FROM agents WHERE id=?').get('c42f4f5e-e583-4523-b633-37220dd650a0');
 assert.ok(other&&other.owner!==owner&&other.secret_null===1);
 agent={...JSON.parse(row.data),no:row.no,tradingStatus:'PAUSED'};
 assert.equal(agent.coin,null);
 assert.equal(db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get(id)?.address,agent.tradingWallet);
 assert.equal(db.prepare('SELECT count(*) AS n FROM paper_states WHERE agent_id=?').get(id).n,1);
 const paper=JSON.parse(db.prepare('SELECT data FROM paper_states WHERE agent_id=?').get(id).data);
 const history=db.prepare('SELECT id,data FROM paper_history WHERE agent_id=? ORDER BY id DESC').all(id).map(row=>({...JSON.parse(row.data),id:'paper:'+row.id}));
 const projection=projectTrading(agent,paper,history);
 assert.equal(projection.agentId,id);
 assert.equal(projection.status,'PAUSED');
 assert.equal(projection.mode,'paper');
 assert.notEqual(projection.tokenName,'launch test','Devnet draft token is not restored as Agent identity');
}finally{db.close();}

const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(route.request().method()!=='GET'){writes.push(path);return route.abort();}
   if(path==='/api/state')return route.fulfill({json:{config:publicConfig('mainnet'),session:{address:owner},agents:[agent],events:[],coins:[],feed:[],tokens:[],bonded:[],stats:{agentsTotal:1}}});
   if(path==='/api/agents/'+id)return route.fulfill({json:agent});
   if(path==='/api/agents/'+id+'/trading')return route.fulfill({json:{agentId:id,status:'PAUSED',mode:'paper',wallet:{address:agent.tradingWallet},openPositions:[],activity:[]}});
   if(path==='/api/agents/'+id+'/analytics')return route.fulfill({json:{agentId:id,mode:'paper',portfolioHistory:[]}});
   if(path==='/api/agents/'+id+'/trading/decisions')return route.fulfill({json:{agentId:id,decisions:[]}});
   if(path==='/api/pump-launch/status')return route.fulfill({json:{agentId:id,status:'Idle',confirmed:false}});
   return route.fulfill({status:404,json:{error:'Fixture only'}});
  });
  const base=process.env.BASE_URL||'http://127.0.0.1:5188';
  await page.goto(base+'/#/agents');
  await page.locator('.tw-agent').waitFor();
  assert.equal(await page.locator('.tw-agent').count(),1);
  assert.match(await page.locator('.tw-agent').innerText(),/LPAD TEST/i);
  assert.match(await page.locator('.tw-agent').innerText(),/Token not configured/);
  await page.goto(base+'/#/agent/'+id);
  await page.locator('.ad-tablist').waitFor();
  assert.match(await page.locator('.ad-agent-hero').innerText(),/Token not configured/);
  assert.equal(await page.locator('.ad-agent-hero').getByText('lpad test',{exact:true}).count(),1);
  await page.goto(base+'/#/tokens');
  await page.locator('#tw-token-directory').waitFor();
  assert.equal(await page.locator('.tw-token-card').count(),0);
  assert.deepEqual(errors,[],`No identity-only rendering exception at ${width}px`);
  assert.deepEqual(writes,[],'Rendering created no transaction or other API write');
  await page.close();
 }
 console.log('Migrated identity-only Agent roster, detail, token-empty and read-only browser fixtures passed.');
}finally{await browser.close();}
