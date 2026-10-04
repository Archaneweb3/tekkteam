import test from 'node:test';import assert from 'node:assert/strict';
import {fork,spawnSync} from 'node:child_process';import {once} from 'node:events';
import http from 'node:http';import net from 'node:net';import fs from 'node:fs';import path from 'node:path';import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';import {createServer} from '../server/app.js';
import {Keypair} from '@solana/web3.js';import nacl from 'tweetnacl';import bs58 from 'bs58';
const free=async()=>{const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const call=(port,url,method='GET',body,headers={})=>new Promise((resolve,reject)=>{const r=http.request({hostname:'127.0.0.1',port,path:url,method,headers:{'Content-Type':'application/json',...headers}},res=>{let b='';res.on('data',v=>b+=v);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(b),headers:res.headers}));});r.on('error',reject);r.end(body===undefined?undefined:JSON.stringify(body));});
function dataset(){const dir=fs.mkdtempSync(path.join(tmpdir(),'tekkteam-http-only-test-'));const app=createServer({dbPath:path.join(dir,'tekkwork.sqlite'),network:'mainnet',mainnetSafetyMode:true,rpc:'https://test.invalid'});app.close();fs.writeFileSync(path.join(dir,'pump-agent-launches.json'),'{"version":2,"receipts":{}}');return dir;}
async function start(kind,dir){const port=await free(),origin=`http://127.0.0.1:${port}`,child=fork(kind==='api'?'server/index.js':'server/pump-launch-index.js',['--http-only','--data-dir',dir,'--origin',origin,'--port',String(port)],{silent:true,env:{...process.env,FUNDING_ENABLED:'true',WITHDRAWAL_ENABLED:'true',LIVE_TRADING_ENABLED:'true',PUBLIC_METADATA_ORIGIN:'https://must-not-publish.invalid'}});let out='',err='';child.stderr.on('data',b=>err+=b);await new Promise((ok,no)=>{child.stdout.on('data',b=>{out+=b;if(out.includes('HTTP_ONLY_READY'))ok();});child.once('exit',code=>no(Error('startup '+code+' '+err)));});return {port,origin,child,stop:async()=>{const done=once(child,'exit');child.send('shutdown');await done;}};}
test('product API HTTP-only retains real auth and denies effect routes despite hostile ambient flags',async()=>{
 const dir=dataset(),run=await start('api',dir);try{
  const h={Origin:run.origin};const health=await call(run.port,'/api/health');assert.equal(health.status,200);for(const k of ['fundingEnabled','withdrawalEnabled','liveTradingEnabled','broadcastEnabled'])assert.equal(health.data[k],false,k);
  const caps=(await call(run.port,'/api/runtime-capabilities')).data;for(const k of ['workers','signing','broadcast','publishing','funding','withdrawal','live'])assert.equal(caps[k],false,k);
  assert.equal((await call(run.port,'/api/launchpad/agent-identities','POST',{},h)).status,401);
  const signer=Keypair.generate(),owner=signer.publicKey.toBase58();const c=await call(run.port,'/api/auth/challenge','POST',{address:owner},h);assert.equal(c.status,200);
  const bad=await call(run.port,'/api/auth/verify','POST',{address:owner,id:c.data.id,signature:bs58.encode(new Uint8Array(64))},h);assert.notEqual(bad.status,200);
  const fresh=await call(run.port,'/api/auth/challenge','POST',{address:owner},h);const verified=await call(run.port,'/api/auth/verify','POST',{address:owner,id:fresh.data.id,signature:bs58.encode(nacl.sign.detached(Buffer.from(fresh.data.message),signer.secretKey))},h);assert.equal(verified.status,200);const cookie=verified.headers['set-cookie'][0].split(';')[0];
  for(const route of ['/api/agents/x/fund','/api/agents/x/withdraw','/api/agents/x/trading/start','/api/dex/prepare','/api/pump-launch/submit','/api/agents','/api/wallet/mainnet-balance','/api/agents/x/delete'])for(const method of ['GET','POST'])assert.equal((await call(run.port,route,method,method==='POST'?{}:undefined,{...h,Cookie:cookie})).status,403,method+route);
  assert.equal((await call(run.port,'/api/auth/challenge','POST',{address:owner},{Origin:'http://evil.invalid'})).status,403);
  assert.equal((await call(run.port,'/api/state?x=1')).status,403);
 }finally{await run.stop();}
 const db=new DatabaseSync(path.join(dir,'tekkwork.sqlite'),{readOnly:true});for(const table of ['agents','agent_wallets','submissions'])assert.equal(db.prepare('SELECT count(*) AS n FROM '+table).get().n,0);db.close();
});
test('product launch HTTP-only rejects every operation before journal writes or effect ports',async()=>{
 const dir=dataset(),before=fs.readFileSync(path.join(dir,'pump-agent-launches.json'),'utf8'),run=await start('launch',dir);try{
  assert.equal((await call(run.port,'/pump-launch/health')).data.broadcast,false);
  for(const route of ['prepare','review','submit','delete-draft','status'])for(const method of ['GET','POST'])assert.equal((await call(run.port,'/pump-launch/'+route,method,method==='POST'?{agentId:'x'}:undefined,{Origin:run.origin})).status,403);
 }finally{await run.stop();}
 assert.equal(fs.readFileSync(path.join(dir,'pump-agent-launches.json'),'utf8'),before);assert.equal(fs.existsSync(path.join(dir,'pump-agent-launches-prepare-attempts.json')),false);
});
test('explicit HTTP-only mode refuses missing data and never falls back to local dotenv',()=>{
 const result=spawnSync(process.execPath,['server/index.js','--http-only'],{encoding:'utf8',timeout:10000});assert.notEqual(result.status,0);assert.match(result.stderr,/HTTP_ONLY_EXPLICIT_DATA_REQUIRED/);
});
test('HTTP-only refuses non-Mainnet or incomplete storage before product initialization',()=>{
 const dir=dataset(),dbPath=path.join(dir,'tekkwork.sqlite');const db=new DatabaseSync(dbPath);db.prepare("UPDATE settings SET value='devnet' WHERE key='network_binding'").run();db.close();const before=fs.readFileSync(dbPath);
 const args=['server/index.js','--http-only','--data-dir',dir,'--port','4490','--origin','http://127.0.0.1:4490'];
 const wrong=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000});assert.notEqual(wrong.status,0);assert.match(wrong.stderr,/HTTP_ONLY_MAINNET_DATA_REQUIRED/);assert.deepEqual(fs.readFileSync(dbPath),before);
 fs.renameSync(path.join(dir,'pump-agent-launches.json'),path.join(dir,'preserved-journal.json'));
 const missing=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000});assert.notEqual(missing.status,0);assert.equal(fs.existsSync(path.join(dir,'pump-agent-launches.json')),false);assert.deepEqual(fs.readFileSync(dbPath),before);
});
test('process boundary rejects outbound transports and child signing workers',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',`await import('./server/http-only-outbound.js'); const {spawn}=await import('node:child_process'); const {connect}=await import('node:net'); for(const action of [()=>spawn('node'),()=>connect(1,'127.0.0.1'),()=>fetch('https://example.invalid')]){try{await action();process.exit(2);}catch(e){if(e.code!=='HTTP_ONLY_EFFECT_DISABLED')throw e;}}`],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);
});
test('linked SQLite sidecar is rejected before opening the selected database',()=>{
 const dir=dataset(),outside=fs.mkdtempSync(path.join(tmpdir(),'tekkteam-sidecar-test-')),sentinel=path.join(outside,'sentinel');fs.writeFileSync(sentinel,'foreign file must stay unchanged');
 fs.linkSync(sentinel,path.join(dir,'tekkwork.sqlite-wal'));const before=fs.readFileSync(path.join(dir,'tekkwork.sqlite'));
 const result=spawnSync(process.execPath,['server/index.js','--http-only','--data-dir',dir,'--port','4490','--origin','http://127.0.0.1:4490'],{encoding:'utf8',timeout:10000});assert.notEqual(result.status,0);assert.match(result.stderr,/HTTP_ONLY_EXISTING_DATA_REQUIRED/);assert.equal(fs.readFileSync(sentinel,'utf8'),'foreign file must stay unchanged');assert.deepEqual(fs.readFileSync(path.join(dir,'tekkwork.sqlite')),before);
});

