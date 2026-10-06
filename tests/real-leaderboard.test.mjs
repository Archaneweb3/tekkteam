import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {realLeaderboard,utcTradingWeek} from '../server/real-leaderboard.js';
import {createServer} from '../server/app.js';
import {createDexLedger} from '../server/dex/ledger.js';
import {DatabaseSync} from 'node:sqlite';
const now=Date.parse('2026-10-06T12:00:00Z'),start=utcTradingWeek(now).start;
const agents=['a','b','private'].map(id=>({id,creator:'owner-'+id,name:id,character:'robot',strategy:'operator',secret:'never-public',wallet:'never-public'}));
const publications=agents.slice(0,2).map(a=>({agentId:a.id,owner:a.creator,enabled:true}));
let seq=0;
function trade(agentId,direction,input,output,time=start+3600000){
 const id=String(++seq),intent={agentId,owner:'owner-'+agentId,agentWallet:'wallet-'+agentId,network:'solana:mainnet',direction,inputMint:direction==='BUY'?'SOL':'mint-'+agentId,outputMint:direction==='BUY'?'mint-'+agentId:'SOL',inputAmount:String(input),mode:'LIVE_AUTONOMOUS'};
 const receipt={executionId:id,signature:'signature-'+id,messageHash:'hash-'+id,intent,finalized:true,slot:seq,chainBlockTime:time/1000,actualInput:String(input),actualOutput:String(output),networkFeeLamports:'10'};
 return {id,intent,receipt,status:'CONFIRMED',signature:receipt.signature,messageHash:receipt.messageHash,productionProvenance:{environment:'PRODUCTION',origin:'https://tekkteam.tech',network:intent.network,classification:'USER_OPERATION'}};
}
const rank=records=>realLeaderboard({agents,publications,records,now});
test('closed cycles count once, partial sells and fees use exact integers and UTC close time',()=>{
 seq=0;const records=[trade('a','BUY',1000,10,start-3600000),trade('a','SELL',4,500),trade('a','SELL',6,800),trade('b','BUY',2000,20),trade('b','SELL',20,2500)];
 const r=rank(records);assert.deepEqual(r.agents.map(a=>a.agentId),['a','b']);assert.equal(r.agents[0].realizedPnlLamports,'270');assert.equal(r.agents[0].closedPositionCount,1);assert.equal(r.agents[0].roiBps,'2673');
 assert.deepEqual(realLeaderboard({agents,publications,records,now,sort:'sol'}).agents.map(a=>a.agentId),['b','a']);
 assert.deepEqual(rank(records.slice(0,2)).agents,[]);assert.equal(r.week.startsAt,'2026-10-05T00:00:00.000Z');
 assert.doesNotMatch(JSON.stringify(r),/never-public|wallet-a|owner-a|signature-/);
});
test('nonproduction, QA, unfinalized, malformed, unopted and uncertain order cannot rank',()=>{
 for(const mutate of [r=>r.receipt.finalized=false,r=>r.receipt.chainBlockTime=null,r=>r.intent.mode='AUTONOMOUS_ACCEPTANCE_TEST',r=>r.productionProvenance=null,r=>r.productionProvenance.origin='https://staging.tekkteam.tech',r=>r.receipt.messageHash='wrong',r=>r.receipt.actualInput='999',r=>r.receipt.chainBlockTime=(start-1000)/1000]){
  const records=[trade('a','BUY',1000,10),trade('a','SELL',10,1500)];mutate(records[1]);assert.deepEqual(rank(records).agents,[]);
 }
 assert.deepEqual(rank([trade('private','BUY',1000,10),trade('private','SELL',10,1500)]).agents,[]);
 const collision=[trade('a','BUY',1000,10),trade('a','SELL',10,1500)];collision[1].receipt.slot=collision[0].receipt.slot;assert.deepEqual(rank(collision).agents,[]);
 const wrongOwner=publications.map(p=>({...p,owner:'someone-else'}));assert.deepEqual(realLeaderboard({agents,publications:wrongOwner,records:collision,now}).agents,[]);
});
test('a completed QA cycle stays excluded without contaminating a subsequent production cycle',()=>{
 const records=[trade('a','BUY',1000,10),trade('a','SELL',10,1500),trade('a','BUY',1000,10),trade('a','SELL',10,1400)];
 for(const r of records.slice(0,2)){r.productionProvenance=null;r.receipt.chainBlockTime=null;}
 const r=rank(records);assert.equal(r.agents[0].closedPositionCount,1);assert.equal(r.agents[0].realizedPnlLamports,'380');
});
test('finalized failed operation has no token effect and cannot erase a completed cycle',()=>{
 const records=[trade('a','BUY',1000,10),trade('a','SELL',10,1400),trade('a','SELL',10,1000)];
 records[2].status='FAILED';records[2].reason='FINALIZED_ONCHAIN_ERROR';records[2].receipt.status='FAILED';records[2].receipt.chainBlockTime=null;
 assert.equal(rank(records).agents[0].realizedPnlLamports,'380');
});
test('production provenance is default-absent, immutable, and never retrospectively applied',t=>{
 for(const [origin,mode,expected] of [[null,'LIVE_AUTONOMOUS',false],['https://staging.tekkteam.tech','LIVE_AUTONOMOUS',false],['https://tekkteam.tech','AUTONOMOUS_ACCEPTANCE_TEST',false],['https://tekkteam.tech','LIVE_AUTONOMOUS',true]]){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());const l=createDexLedger(db,{productionOrigin:origin}),intent={agentId:'a',owner:'o',agentWallet:'w',mode,createdAt:now};
  const r=l.reserve({intent,requestKey:'key',fingerprint:'fingerprint'}).record;assert.equal(!!r.productionProvenance,expected);
  assert.throws(()=>l.transition(r.id,['QUOTED'],'PREPARING',{productionProvenance:{environment:'PRODUCTION'}}),/IMMUTABLE_INTENT/);
  const replay=createDexLedger(db,{productionOrigin:'https://tekkteam.tech'}).reserve({intent,requestKey:'key',fingerprint:'fingerprint'});assert.equal(!!replay.record.productionProvenance,expected);assert.equal(replay.existing,true);
 }
});
test('destroy prevents a late response from changing a navigated-away page',async()=>{
 const source=readFileSync(new URL('../public/app/real-leaderboard.js',import.meta.url),'utf8').replace("import {request} from './backend.js';","const request=()=>{throw Error('Explicit test transport required');};").replace("import {characterPortraitUrl} from './character-registry.js';","const characterPortraitUrl=()=>'';");
 const {mountRealLeaderboard}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 let finish;const pending=new Promise(r=>{finish=r;});const button={disabled:false,textContent:''},rankings={innerHTML:''},alert={textContent:''};let accesses=0;
 const host={innerHTML:'',querySelector(s){accesses++;return s==='[data-refresh-rank]'?button:s==='[data-rankings]'?rankings:alert;},querySelectorAll(){return [];}};
 const scene=mountRealLeaderboard(host,{api:p=>p==='/state'?Promise.resolve({session:null}):pending});scene.destroy();const before=accesses;
 finish({mode:'REAL',agents:[],week:{startsAt:'2026-10-05T00:00:00Z'}});await new Promise(r=>setImmediate(r));assert.equal(accesses,before);assert.equal(rankings.innerHTML,'');
});
test('public endpoint has no owner state; publishing requires authenticated exact owner and explicit choice',async t=>{
 const instance=createServer({dbPath:join(mkdtempSync(join(tmpdir(),'tekk-rank-')),'db.sqlite'),now:()=>now});
 const db=instance.store.db,server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();instance.close();});
 db.prepare('INSERT INTO agents(id,owner,data,secret) VALUES(?,?,?,NULL)').run('a','owner-a',JSON.stringify(agents[0]));
 db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update('cookie').digest('hex'),'owner-a',now+100000);
 const call=async(path,body,cookie=true)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method:body?'POST':'GET',headers:{origin:'http://127.0.0.1:5188','content-type':'application/json',...(cookie?{cookie:'tw_session=cookie'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};};
 assert.deepEqual((await call('/leaderboard',null,false)).data.agents,[]);
 assert.equal((await call('/agents/a/publication',{enabled:true},false)).status,401);
 assert.equal((await call('/agents/a/publication',{enabled:'true'})).status,400);
 assert.equal((await call('/agents/a/publication',{enabled:true,owner:'other'})).status,400);
 assert.equal((await call('/agents/a/publication',{enabled:true})).status,200);
 assert.equal((await call('/agents/a/publication')).data.enabled,true);
 assert.equal((await call('/agents/a/publication',{enabled:false})).data.enabled,false);
 assert.equal((await call('/leaderboard?sort=other')).status,400);
});
