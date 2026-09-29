// Render the real UI with isolated read-only API fixtures; no wallet/backend writes.
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {publicConfig} from '../server/config.js';
const output='artifacts/ui';mkdirSync(output,{recursive:true});
const owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS',ids=['frank','cupsey','fomy','alon','satoshi'];
const names=['Felix Builder','Nora Signal','Otto Analyst','Theo Scout','Hugo Director'];
const agents=ids.map((character,i)=>({id:'visual-'+i,no:i+1,name:names[i],creator:owner,character,strategy:['balanced','momentum','selective'][i%3],status:'DRAFT',tradingStatus:['WORKING','PAUSED','READY','DRAFT','DRAFT'][i],createdAt:Date.now()-i*3600000,description:'A measured approach to market momentum. Built to observe, act and stay within limits.',coin:{name:names[i].split(' ')[0]+' Token',ticker:['FLX','NORA','OTTO','THEO','HUGO'][i]}}));
const projections=agents.map((a,i)=>({agentId:a.id,name:a.name,character:a.character,createdAt:a.createdAt,launchToken:{name:a.coin.name,symbol:a.coin.ticker},status:a.tradingStatus,strategy:a.strategy,mode:'paper',tokenName:a.coin.name,tokenSymbol:a.coin.ticker,tokenMint:owner,paperStartingCapitalSol:.1,paperCashSol:.095,portfolioValueSol:.104-i*.001,totalPnlSol:.004-i*.001,realizedPnlSol:.002,unrealizedPnlSol:.002,roiPercent:4-i,tradeCount:8-i,winRate:60,wins:3,losses:2,openPositions:[],activity:[],profiles:['balanced','momentum','selective'],wallet:null}));
const events=['BUY','SELL','RISK_REJECTED'].map((type,i)=>({eventId:'fixture-'+i,agentId:agents[i].id,type,tokenSymbol:'SOL',strategy:agents[i].strategy,executedSizeSol:i<2?.01:null,pnlSol:i===1?.001:null,pnlPercent:i===1?3.8:null,timestamp:Date.now()-i*20000,reason:['Momentum threshold passed.','Position target reached.','Liquidity below configured minimum.'][i]}));
const b=await chromium.launch();
try{
 const p=await b.newPage();const errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/**',r=>{const u=new URL(r.request().url()),path=u.pathname;if(r.request().method()!=='GET'){writes.push(path);return r.abort();}let data;
 if(path==='/api/state')data={session:{address:owner},agents,config:publicConfig('devnet'),events:[],stats:{}};
 else if(path==='/api/wallet/mainnet-balance')data={owner,network:'solana:101',lamports:112100000};
 else if(path==='/api/trading/network')data={agents:projections,activity:events,overview:{activeTraders:1,openPositions:0,totalPaperPnlSol:.01}};
 else if(path==='/api/trading/leaderboard')data={agents:projections};
 else if(path==='/api/trading/payroll')data={agents:projections.slice(0,2)};
 else if(path.endsWith('/deletion-eligibility'))data={agentId:path.split('/')[3],canDelete:true,launchState:'unlaunched'};
 else if(path.endsWith('/trading'))data={...projections[0],activity:events};
 else if(path.startsWith('/api/agents/'))data=agents.find(a=>path.endsWith(a.id))??agents[0];
 else if(path==='/api/pump-launch/status')data={status:'Idle'};
 else data={};return r.fulfill({json:data});});
 for(const width of [1440,1280,390]){await p.setViewportSize({width,height:1000});for(const [name,route] of [['overview','overview'],['agents','agents'],['create','agents/new'],['detail','agent/visual-0'],['tokens','tokens'],['characters','skins'],['guide','how']]){
 await p.goto('http://127.0.0.1:5188/#/'+route);await p.locator('main h1').first().waitFor();await p.waitForTimeout(900);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow '+width);
 if(name==='overview'){assert.equal(await p.locator('#tw-office canvas').count(),1);assert.ok((await p.locator('#tw-office').boundingBox()).height>=350);await p.locator('.ov-payroll-grid .tw-agent').first().waitFor();}
 if(name==='create')assert.equal(await p.locator('input[name=character]').count(),5);
 await p.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true});console.log(name,width,'PASS');}}
 await p.goto('http://127.0.0.1:5188/#/agents/new');await p.locator('.tw-character-option').filter({has:p.locator('input[value=cupsey]')}).click();assert.equal(await p.locator('input[name=character]:checked').inputValue(),'cupsey');await p.locator('[name=name]').fill('Selection preserved');
 await p.goto('http://127.0.0.1:5188/#/agent/visual-0');await p.locator('.tw-agent-menu summary').click();await p.getByRole('button',{name:'Delete draft',exact:true}).click();await p.getByRole('button',{name:'Cancel',exact:true}).click();
 await p.getByRole('button',{name:'Open navigation',exact:true}).click();await p.locator('#tw-wallet').click();await p.locator('.tw-wallet-popover').waitFor();assert.ok(await p.locator('.tw-wallet-popover').isVisible());
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);console.log('PASS all viewports, canonical picker, deletion cancel, wallet popover; no writes');
}finally{await b.close();}
