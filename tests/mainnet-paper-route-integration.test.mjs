import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from '../server/app.js';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS',mint='11111111111111111111111111111111',origin='http://127.0.0.1:5188';
test('Mainnet owner scoped Paper configure/start/pause work without custody or Real permission',async t=>{
 let quotes=0;
 const dataDir=mkdtempSync(join(tmpdir(),'tekk-mainnet-paper-'));t.after(()=>rmSync(dataDir,{recursive:true,force:true}));
 const journalPath=join(dataDir,'pump-agent-launches.json');writeFileSync(journalPath,JSON.stringify({version:2,receipts:{}}));
 const s=createServer({dbPath:':memory:',vaultKey:Buffer.alloc(32,7).toString('base64'),network:'mainnet',mainnetSafetyMode:true,rpc:'https://fixture.invalid',tokenDraftConfiguration:{dataDir,assetRoot:join(dataDir,'pump-metadata-site'),journalPath,publicOrigin:'https://fixture.invalid',publisherOrigin:'https://fixture.invalid'},realMoneyNetwork:{connection:{},verify:async()=>{throw Error('NO_RPC')},status:()=>({realMoneyNetwork:'UNAVAILABLE'})},tradingOptions:{receipt:a=>({agentId:a.id,owner:a.creator,network:'solana:101',status:'Success',confirmed:true,signature:'SYNTHETIC_ONLY',mint}),market:async target=>{quotes++;return {network:'solana:101',mint:target,priceUsd:1,solUsd:100,liquidityUsd:100000,observedAt:Date.now()};}}});
 s.store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update('PAPER_ROUTE_FIXTURE').digest('hex'),owner,Date.now()+100000);
 const server=s.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));s.close();});
 const call=async(path,body,cookie=true)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':'PAPER_ROUTE_IDENTITY_01',...(cookie?{Cookie:'tw_session=PAPER_ROUTE_FIXTURE'}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const identity=await call('/launchpad/agent-identities',{name:'Paper fixture',character:'frank',strategy:'balanced',description:''});assert.equal(identity.status,201);const path='/agents/'+identity.data.id+'/trading/';
 const contract=await fetch('http://127.0.0.1:'+server.address().port+'/api/agents/'+identity.data.id+'/contract',{headers:{Cookie:'tw_session=PAPER_ROUTE_FIXTURE'}});assert.equal(contract.status,200);const dto=await contract.json();assert.equal(dto.tokenDraft.save.allowed,true);assert.equal(dto.tokenDraft.image.publicDelivery,'UNVERIFIED');assert.equal(dto.tokenDraft.authorizationGranted,false);
 assert.equal((await call(path+'configure',{mode:'paper',strategy:'balanced',tokenMint:mint},false)).status,401);
 for(const action of ['configure','enable','pause','strategy-config']){
  assert.equal((await call(path+action,{mode:'real',strategy:'balanced',tokenMint:mint})).status,403);
  assert.equal((await call(path+action+'?mode=real',{mode:'paper',strategy:'balanced',tokenMint:mint})).status,403);
 }
 assert.equal((await call(path+'configure',{mode:'paper',strategy:'balanced',tokenMint:'So11111111111111111111111111111111111111112'})).status,409);assert.equal(quotes,0);
 assert.equal((await call(path+'configure',{mode:'paper',strategy:'balanced',tokenMint:mint})).status,200);
 assert.equal((await call(path+'enable',{mode:'paper',strategy:'balanced'})).status,200);
 const paused=await call(path+'pause',{mode:'paper'});assert.equal(paused.status,200);assert.equal(paused.data.enabled,false);
 for(const action of ['wallet','balance','fund'])assert.equal((await call(path+action,{mode:'paper'})).status,403);
 assert.equal(s.store.db.prepare('SELECT count(*) AS n FROM agent_wallets').get().n,0);
 assert.equal(s.store.db.prepare('SELECT count(*) AS n FROM submissions').get().n,0);
});
