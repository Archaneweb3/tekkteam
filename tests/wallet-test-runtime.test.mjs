import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {fork} from 'node:child_process';import net from 'node:net';import {once} from 'node:events';
import {Keypair} from '@solana/web3.js';import nacl from 'tweetnacl';import bs58 from 'bs58';
import {walletTestConfig,walletTestRoute,walletTestRequest,walletTestCapabilities} from '../server/wallet-test-policy.js';
const origin='https://wallet-test.example.com';
test('dedicated HTTPS origin and exact wallet-only routes; EVM/transaction API never reachable',()=>{
 const cfg={origin,dataDir:'/isolated',port:4395,rpcUrl:'https://rpc.example.com'};
 assert.equal(walletTestConfig(cfg).origin,origin);
 for(const bad of ['http://127.0.0.1:5199','https://tekkteam.tech','https://www.tekkteam.tech','https://tekkteam.tech.','https://www.tekkteam.tech.','https://localhost.','https://wallet-test.example.com/','https://user:password@wallet-test.example.com','*'])assert.throws(()=>walletTestConfig({...cfg,origin:bad}));
 for(const port of [4190,4193,4291,5199])assert.throws(()=>walletTestConfig({...cfg,port}));
 for(const path of ['/api/pump-launch/prepare','/api/pump-agent-launch','/api/funding','/api/withdrawal','/api/trading','/api/agents','/api/launchpad/agent-identities','/mainnet-rpc','/api/network','/api/wallet','/api/wallet/mainnet-balance?address=0x123','/api/wallet/mainnet-balance?refresh=1&x=1','/api/auth/verify?x=1','/api/auth/../auth/verify'])for(const method of ['GET','POST','PUT','DELETE','OPTIONS'])assert.equal(walletTestRoute(method,path),false,path);
 const req={socket:{remoteAddress:'127.0.0.1'},method:'POST',url:'/api/auth/challenge',headers:{host:'wallet-test.example.com',origin,'x-forwarded-proto':'https','sec-fetch-site':'same-origin'}};
 assert.equal(walletTestRequest(req,cfg),true);
 for(const headers of [{origin:'https://evil.example.com'},{origin:undefined},{host:'evil.example.com'},{'x-forwarded-proto':'http'},{'sec-fetch-site':'cross-site'}])assert.equal(walletTestRequest({...req,headers:{...req.headers,...headers}},cfg),false);
 assert.equal(walletTestRequest({...req,socket:{remoteAddress:'203.0.113.1'}},cfg),false);
 for(const k of ['workers','signing','broadcast','launch','tokenCreation','funding','withdrawal','transfers','trading','publishing'])assert.equal(walletTestCapabilities[k],false);
});
const free=async()=>{const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port;await new Promise(r=>s.close(r));return port;};
async function start(file,initialize){
 const child=fork('server/index.js',['--wallet-test','--config',file,...(initialize?['--initialize']:[])],{silent:true,env:{...process.env,LIVE_TRADING_ENABLED:'true',FUNDING_ENABLED:'true'}});let output='',errors='';child.stderr.on('data',b=>errors+=b);
 await new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error('Startup timeout '+errors)),15000);child.once('exit',()=>{clearTimeout(timer);no(Error('Startup rejected '+errors));});child.stdout.on('data',b=>{output+=b;if(output.includes('WALLET_TEST_READY')){clearTimeout(timer);ok();}});});
 return {child,get output(){return output;},stop:async()=>{const done=once(child,'exit');child.send('shutdown');await done;}};
}
test('real product verifier binds HTTPS origin; Secure cookie survives restart; non-wallet writes denied',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tekkteam-m2b-test-')),dataDir=mkdtempSync(join(tmpdir(),'tekkteam-m2b-store-')),port=await free(),file=join(dir,'config.json');
 writeFileSync(file,JSON.stringify({origin,dataDir,port,rpcUrl:'https://rpc.example.invalid'}));
 const call=async(path,{method='GET',body,headers={}}={})=>{const r=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{origin,'x-forwarded-proto':'https','Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,cookie:r.headers.get('set-cookie'),data:await r.json()};};
 let app=await start(file,true);const key=Keypair.fromSeed(new Uint8Array(32).fill(41)),owner=key.publicKey.toBase58();let cookie;
 try{
  const health=await call('/api/health');assert.equal(health.status,200);for(const k of ['fundingEnabled','withdrawalEnabled','broadcastEnabled','liveTradingEnabled','trading'])assert.equal(health.data[k],false,k);
  assert.equal((await call('/api/state')).data.session,null);
  assert.equal((await call('/api/wallet/mainnet-balance')).status,401);
  assert.equal((await call('/api/auth/challenge',{method:'POST',body:{address:'0x'+'a'.repeat(40)}})).status,400);
  const c=await call('/api/auth/challenge',{method:'POST',body:{address:owner}});assert.equal(c.status,200);
  assert.ok(c.data.message.includes('Origin: '+origin+'\n'));assert.ok(c.data.message.includes(owner));assert.ok(c.data.message.includes('Nonce: '+c.data.id));assert.match(c.data.message,/Expires: /);assert.match(c.data.message,/does not authorize a payment/);assert.doesNotMatch(c.data.message,/127\.0\.0\.1/);
  const signed={id:c.data.id,signature:bs58.encode(nacl.sign.detached(Buffer.from(c.data.message),key.secretKey))};
  assert.equal((await call('/api/auth/verify',{method:'POST',body:signed,headers:{origin:'https://evil.example.com'}})).status,403);
  const verified=await call('/api/auth/verify',{method:'POST',body:signed});assert.equal(verified.status,200);assert.match(verified.cookie,/HttpOnly/);assert.match(verified.cookie,/Secure/);assert.match(verified.cookie,/SameSite=Strict/);cookie=verified.cookie.split(';')[0];
  assert.equal((await call('/api/auth/verify',{method:'POST',body:signed})).status,401);
  for(const route of ['/api/funding','/api/withdrawal','/api/pump-launch/prepare','/api/launchpad/agent-identities','/api/agents/a/trading/enable'])assert.equal((await call(route,{method:'POST',body:{},headers:{Cookie:cookie}})).status,403);
  assert.equal((await call('/api/state',{headers:{Cookie:cookie}})).data.session.address,owner);
  assert.doesNotMatch(app.output,/signature|secretKey|rpc\.example/);
 }finally{await app.stop();}
 app=await start(file,false);
 try{assert.equal((await call('/api/state',{headers:{Cookie:cookie}})).data.session.address,owner);assert.equal((await call('/api/auth/logout',{method:'POST',body:{},headers:{Cookie:cookie}})).status,200);assert.equal((await call('/api/state',{headers:{Cookie:cookie}})).data.session,null);}finally{await app.stop();}
 assert.equal(readFileSync(join(dataDir,'wallet-test.key')).length,32);
});
test('explicit M3 profile preserves M2 store and exposes only off-chain owner writes and validated public assets',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tekkteam-m3-profile-')),dataDir=mkdtempSync(join(tmpdir(),'tekkteam-m3-store-')),port=await free(),file=join(dir,'config.json'),cfg={origin,dataDir,port,rpcUrl:'https://rpc.example.invalid'};
 writeFileSync(file,JSON.stringify(cfg));let runtime=await start(file,true);await runtime.stop();const keyBytes=readFileSync(join(dataDir,'wallet-test.key'));
 writeFileSync(join(dataDir,'pump-agent-launches.json'),JSON.stringify({version:2,receipts:{}}));writeFileSync(file,JSON.stringify({...cfg,launchPreparation:true}));runtime=await start(file,false);
 const call=async(path,body,cookie)=>{const r=await fetch(`http://127.0.0.1:${port}${path}`,{method:body===undefined?'GET':'POST',headers:{origin,'x-forwarded-proto':'https','Content-Type':'application/json',Cookie:cookie??'','Idempotency-Key':crypto.randomUUID()},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
  const cap=await call('/api/runtime-capabilities');assert.equal(cap.data.mode,'M3_UNSIGNED_PREPARATION');assert.equal(cap.data.launchPreparation,true);for(const k of ['signing','broadcast','launch','funding','withdrawal','transfers','trading'])assert.equal(cap.data[k],false);
  const key=Keypair.fromSeed(new Uint8Array(32).fill(51)),challenge=await call('/api/auth/challenge',{address:key.publicKey.toBase58()}),verified=await call('/api/auth/verify',{id:challenge.data.id,signature:bs58.encode(nacl.sign.detached(Buffer.from(challenge.data.message),key.secretKey))});assert.equal(verified.status,200);
  const created=await call('/api/launchpad/agent-identities',{name:'Fixture M3 Agent',character:'frank',strategy:'balanced'},verified.cookie);assert.equal(created.status,201);
  const id=created.data.id;assert.equal((await call('/api/agents/'+id,undefined,verified.cookie)).status,200);assert.equal((await call('/api/launchpad/agents/'+id+'/preparation',{requestId:crypto.randomUUID(),initialBuy:'0'})).status,401);
  for(const path of ['/api/pump-launch/submit','/api/pump-launch/review','/api/agents/'+id+'/trading/enable','/api/funding'])assert.equal((await call(path,{},verified.cookie)).status,403);
  assert.equal((await call('/'+ 'a'.repeat(43))).status,404);assert.equal((await call('/metadata/agents/'+id+'/'+ 'a'.repeat(64)+'.png')).status,404);assert.equal((await call('/wallet-test.key')).status,403);
  // Disposable public assets test actual runtime delivery; no production data.
  const publicRoot=join(dataDir,'pump-metadata-site','public'),image=Buffer.from([137,80,78,71,13,10,26,10]),imageHash=createHash('sha256').update(image).digest('hex');
  mkdirSync(join(publicRoot,'metadata','agents',id),{recursive:true});writeFileSync(join(publicRoot,'metadata','agents',id,imageHash+'.png'),image);
  const metadata=JSON.stringify({name:'Fixture',symbol:'FIX',image:origin+'/metadata/agents/'+id+'/'+imageHash+'.png',properties:{agentId:id,agentName:'Fixture',character:'frank',owner:key.publicKey.toBase58()}}),digest=createHash('sha256').update(metadata).digest('base64url');writeFileSync(join(publicRoot,digest),metadata);
  const externalHeaders={origin:'https://pump.fun','sec-fetch-site':'cross-site','x-forwarded-proto':'https'};
  for(const path of ['/'+digest,'/metadata/agents/'+id+'/'+imageHash+'.png']){const r=await fetch(`http://127.0.0.1:${port}${path}`,{headers:externalHeaders});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.equal(r.headers.get('cross-origin-resource-policy'),'cross-origin');}
  for(const path of ['/api/state','/api/wallet/mainnet-balance','/'+digest+'?private=1','/wallet-test.key'])assert.equal((await fetch(`http://127.0.0.1:${port}${path}`,{headers:externalHeaders})).status,403);
  writeFileSync(join(publicRoot,digest),JSON.stringify({secret:'never public'}));assert.equal((await fetch(`http://127.0.0.1:${port}/`+digest,{headers:externalHeaders})).status,404);
  assert.deepEqual(readFileSync(join(dataDir,'wallet-test.key')),keyBytes);
 }finally{await runtime.stop();}
});
