import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Keypair} from '@solana/web3.js';
import http from 'node:http';
import {createServer} from '../server/app.js';
import {createPumpLaunch} from '../server/pump-launch.js';
import {removeDraftMetadata,deletionEligibility} from '../server/draft-deletion.js';

test('expired never-submitted Devnet preparation is stale; active/signed preparations lock',async()=>{
 const root=mkdtempSync(join(tmpdir(),'prepared-delete-')),a={id:'prepared',status:'PREPARED',network:'devnet',coin:{mint:null},launch:{expiresAt:1,lastValidBlockHeight:1}};
 assert.deepEqual(await deletionEligibility(a,root),{agentId:a.id,canDelete:true,launchState:'stale_test_state',reason:null});
 a.launch.expiresAt=Date.now()+60000;assert.equal((await deletionEligibility(a,root)).canDelete,false);a.launch.expiresAt=1;
 a.launch.signature='confirmed-or-pending';assert.equal((await deletionEligibility(a,root)).canDelete,false);
});

test('legacy expired tests: missing receipt is unlaunched; confirmed/corrupt storage locks',async()=>{
 const root=mkdtempSync(join(tmpdir(),'eligibility-')),a={id:'legacy',status:'FAILED',network:'devnet',coin:{mint:null},launch:{failure:'expired',expiresAt:1}};
 const historical={status:'Success',mint:'unrelated',signature:'preserved'};writeFileSync(join(root,'pump-mainnet-launch.json'),JSON.stringify(historical));
 assert.deepEqual(await deletionEligibility(a,root),{agentId:'legacy',canDelete:true,launchState:'stale_test_state',reason:null});
 writeFileSync(join(root,'pump-agent-launches.json'),JSON.stringify({version:2,receipts:{legacy:{confirmed:true,status:'Success'}}}));assert.equal((await deletionEligibility(a,root)).launchState,'launched');
 writeFileSync(join(root,'pump-agent-launches.json'),'{invalid');assert.equal((await deletionEligibility(a,root)).launchState,'unknown');
 assert.deepEqual(JSON.parse(readFileSync(join(root,'pump-mainnet-launch.json'))),historical);
});

test('authenticated deletion removes only draft data; owner/state checks fail closed',async t=>{
 const root=mkdtempSync(join(tmpdir(),'tekk-delete-')),owner=Keypair.generate().publicKey.toBase58();let allow=true,calls=0;
 const app=createServer({dbPath:join(root,'db.sqlite'),deletionGuard:async()=>{calls++;if(!allow)throw Object.assign(Error('Confirmed launch'),{status:409});}});
 const server=app.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();app.close();});
 const db=app.store.db;db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update('test-cookie').digest('hex'),owner,Date.now()+60000);
 const add=(status='DRAFT')=>{const id=randomUUID(),a={id,creator:owner,name:'Draft',status,coin:{name:'Token',ticker:'TOK',mint:null},strategy:'selective',character:'frank'};db.prepare('INSERT INTO agents(id,owner,data,secret) VALUES(?,?,?,?)').run(id,owner,JSON.stringify(a),'encrypted-test');db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(owner,id,'hash',id);db.prepare('INSERT INTO events(agent_id,owner,type,message,created_at) VALUES(?,?,?,?,?)').run(id,owner,'draft','created',Date.now());return a;};
 const a=add(),other=add();const call=(id,cookie='tw_session=test-cookie')=>fetch(`http://127.0.0.1:${server.address().port}/api/agents/${id}`,{method:'DELETE',headers:{origin:'http://127.0.0.1:5188',cookie}});
 assert.equal((await call(a.id,'')).status,401);allow=false;assert.equal((await call(a.id)).status,409);assert.ok(db.prepare('SELECT 1 FROM agents WHERE id=?').get(a.id));allow=true;
 assert.equal((await call(a.id)).status,200);assert.equal(db.prepare('SELECT 1 FROM agents WHERE id=?').get(a.id),undefined);assert.equal(db.prepare('SELECT 1 FROM requests WHERE agent_id=?').get(a.id),undefined);assert.ok(db.prepare('SELECT 1 FROM agents WHERE id=?').get(other.id));
 assert.equal((await call(add('DEVNET_LIVE').id)).status,409);assert.equal((await call(randomUUID())).status,404);assert.equal(calls,2);
});
test('deletion interlock preserves confirmed history, blocks races and latches tombstone',async t=>{
 const root=mkdtempSync(join(tmpdir(),'tekk-delete-launch-')),journal=join(root,'receipts.json'),owner=Keypair.generate().publicKey.toBase58();
 const receipt={agentId:'live',owner,network:'solana:101',status:'Success',confirmed:true,signature:'historical'};writeFileSync(journal,JSON.stringify({version:2,receipts:{live:receipt}}));let cleaned=0;
 const service=createPumpLaunch({journal,getAgent:async id=>({id,name:'Draft',creator:owner,status:'DRAFT',coin:{name:'Token',ticker:'TOK'},character:'frank'}),removeMetadata:async()=>{cleaned++;}});
 const server=service.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const call=(path,id)=>new Promise((resolve,reject)=>{const req=http.request(`http://127.0.0.1:${server.address().port}/pump-launch/${path}`,{method:'POST',headers:{host:'127.0.0.1:4193',origin:'http://127.0.0.1:5188','content-type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode}));});req.on('error',reject);req.end(JSON.stringify({agentId:id}));});
 assert.equal((await call('delete-draft','live')).status,409);assert.equal(cleaned,0);
 assert.equal((await call('delete-draft','draft')).status,200);assert.equal((await call('prepare','draft')).status,409);
 assert.deepEqual(JSON.parse(readFileSync(journal)).receipts.live,receipt);assert.equal(JSON.parse(readFileSync(journal)).receipts.draft.status,'Deleted');
});
test('local metadata cleanup is scoped; unrelated and shared files survive',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tekk-delete-metadata-'));mkdirSync(join(root,'public/metadata/agents/one'),{recursive:true});mkdirSync(join(root,'public/metadata/agents/two'),{recursive:true});writeFileSync(join(root,'public/metadata/agents/one/token.json'),'{}');writeFileSync(join(root,'public/metadata/agents/two/token.json'),'{}');
 await removeDraftMetadata('one',root);assert.equal(existsSync(join(root,'public/metadata/agents/one')),false);assert.equal(existsSync(join(root,'public/metadata/agents/two/token.json')),true);await assert.rejects(removeDraftMetadata('../two',root));
});
