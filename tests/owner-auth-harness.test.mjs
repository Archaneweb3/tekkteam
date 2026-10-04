import test from 'node:test';import assert from 'node:assert/strict';
import {fork} from 'node:child_process';import {once} from 'node:events';import http from 'node:http';import net from 'node:net';
import {mkdtempSync,readFileSync,writeFileSync,linkSync,symlinkSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {Keypair} from '@solana/web3.js';import nacl from 'tweetnacl';import bs58 from 'bs58';import sharp from 'sharp';import {DatabaseSync} from 'node:sqlite';
import {createServer} from '../server/app.js';import {validateOwnerAuthChallenge} from '../public/app/owner-auth-review.js';
import vm from 'node:vm';
import {createIdentityIntentJournal} from '../public/app/launchpad-identity-intent.js';
import {createLaunchpadActions} from '../public/app/launchpad-page.js';
const free=async()=>{const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const call=(p,route,{method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:p,path:route,method,headers},res=>{let b='';res.on('data',x=>b+=x);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(b),headers:res.headers}));});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});
const signer=Keypair.fromSeed(Buffer.alloc(32,66)),owner=signer.publicKey.toBase58();
const sign=message=>bs58.encode(nacl.sign.detached(Buffer.from(message),signer.secretKey));
test('isolated actual auth challenge/verifier, replay guards, owner save/reload/retry; no synthetic human sessions',async()=>{
 const bp=await free(),fp=await free(),origin=`http://127.0.0.1:${fp}`;
 const child=fork('tools/local-owner-preview/owner-auth-backend.mjs',[String(bp),String(fp)],{silent:true,env:{...process.env,DATA_DIR:'MUST_NOT_USE',VAULT_KEY_BASE64:'MUST_NOT_USE'}});let stderr='',stdout='';child.stderr.on('data',b=>stderr+=b);
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Harness startup timeout')),20000);child.once('exit',()=>{clearTimeout(timer);reject(Error('Harness startup failed'));});child.stdout.on('data',b=>{stdout+=b;for(const line of stdout.split('\n'))try{const x=JSON.parse(line);if(x.status==='READY'){clearTimeout(timer);resolve(x);}}catch{}});});
 const headers={Origin:origin,'Content-Type':'application/json'};
 const post=(route,body,h=headers)=>call(bp,route,{method:'POST',headers:h,body});
 try{
  assert.equal(ready.seededSessions,0);assert.equal(ready.outboundGuard,'PASS');assert.equal(ready.backgroundJobs,false);
  assert.equal((await call(bp,'/api/state')).data.session,null);
  const h=(await call(bp,'/api/health')).data;for(const k of ['liveTradingEnabled','fundingEnabled','withdrawalEnabled','broadcastEnabled'])assert.equal(h[k],false);for(const k of ['globalTradingKillSwitch','realMoneyEmergencyStop','autonomousKillSwitch'])assert.equal(h[k],true);
  for(const r of ['/api/wallet/mainnet-balance','/api/pump-launch/prepare','/api/agents/a/pump-runtime/prepare','/api/network','/mainnet-rpc'])assert.equal((await post(r,{})).status,403);
  assert.equal((await post('/api/auth/challenge',{address:owner},{...headers,Origin:'https://evil.invalid'})).status,403);
  const ch=await post('/api/auth/challenge',{address:owner});assert.equal(ch.status,200);validateOwnerAuthChallenge(ch.data,owner,origin);
  assert.equal((await call(bp,'/api/state')).data.session,null);
  assert.equal((await post('/api/auth/verify',{id:ch.data.id,signature:'invalid'})).status,401);
  assert.equal((await post('/api/auth/verify',{id:ch.data.id,signature:sign(ch.data.message)},{...headers,Origin:'https://evil.invalid'})).status,403);
  const verified=await post('/api/auth/verify',{id:ch.data.id,signature:sign(ch.data.message)});assert.equal(verified.status,200);
  const cookie=verified.headers['set-cookie'][0].split(';')[0];assert.ok(cookie.startsWith('tw_owner_harness_session='));assert.match(verified.headers['set-cookie'][0],/HttpOnly/);assert.match(verified.headers['set-cookie'][0],/SameSite=Strict/);
  assert.equal((await post('/api/auth/verify',{id:ch.data.id,signature:sign(ch.data.message)})).status,401);
  const ah={...headers,Cookie:cookie,'Idempotency-Key':'MANUAL_HARNESS_IDENTITY_001'};
  const input={name:'LOCAL_AUTH fixture',character:'frank',strategy:'balanced'},pendingValues=new Map(),storage={getItem:k=>pendingValues.get(k)??null,setItem:(k,v)=>pendingValues.set(k,v),removeItem:k=>pendingValues.delete(k)},identityKeys=[];let loseIdentityResponse=true;
  const actions=()=>createLaunchpadActions({owner,identityJournal:createIdentityIntentJournal(owner,storage),createIdentity:async(body,key)=>{identityKeys.push(key);const response=await post('/api/launchpad/agent-identities',body,{...ah,'Idempotency-Key':key});assert.ok([200,201].includes(response.status));if(loseIdentityResponse)throw Error('LOCAL_RESPONSE_LOST_AFTER_HTTP_COMMIT');return response.data;}});
  await assert.rejects(actions().create(input),/LOCAL_RESPONSE_LOST/);loseIdentityResponse=false;
  const recovered=actions();assert.deepEqual(recovered.pendingIdentity().input,input);const identity=await recovered.create(input);assert.equal(identity.replayed,true);assert.equal(new Set(identityKeys).size,1);assert.equal(recovered.pendingIdentity(),null);const id=identity.id;
  const png=await sharp({create:{width:2,height:2,channels:4,background:'#ffda54'}}).png().toBuffer(),body={draft:{name:'LOCAL_AUTH Coin',ticker:'LOCAL'},expectedRevision:0,tokenImage:'data:image/png;base64,'+png.toString('base64')};
  const th={...ah,'Idempotency-Key':'MANUAL_HARNESS_TOKEN_001'},route='/api/launchpad/agents/'+id+'/token-draft';
  const saved=await post(route,body,th);assert.equal(saved.status,201);
  const reload=await call(bp,'/api/agents/'+id+'/contract',{headers:ah});assert.equal(reload.status,200);assert.equal(reload.data.tokenDraft.revision,1);assert.equal(reload.data.tokenDraft.save.allowed,false);assert.equal(reload.data.lifecycle.launch.state,'CONFIGURED_NOT_LAUNCHED');
  const replay=await post(route,body,th);assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);assert.deepEqual(replay.data.draft,saved.data.draft);
  const advancedIdentity=await post('/api/launchpad/agent-identities',input,{...ah,'Idempotency-Key':identityKeys[0]});assert.equal(advancedIdentity.status,200);assert.equal(advancedIdentity.data.replayed,true);assert.equal(advancedIdentity.data.id,id);assert.ok(advancedIdentity.data.coin);
  assert.equal((await call(bp,'/api/state',{headers:{Cookie:cookie.replace('tw_owner_harness_session','tw_session')}})).data.session,null);
  assert.equal((await post('/api/auth/logout',{},ah)).status,200);assert.equal((await call(bp,'/api/state',{headers:ah})).data.session,null);
 }finally{const exited=once(child,'exit');child.send('shutdown');await exited;}
 const db=new DatabaseSync(path.join(ready.dir,'fixture.sqlite'),{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) n FROM agents').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM launchpad_first_tokens').get().n,1);for(const table of ['agent_wallets','dex_executions','pump_fixture_executions']){const exists=db.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(table);if(exists)assert.equal(db.prepare('SELECT count(*) n FROM '+table).get().n,0);}assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,0);}finally{db.close();}
 assert.doesNotMatch(stdout,/signature|secretKey|tw_owner_harness_session=/);
 const keyBefore=readFileSync(path.join(ready.dir,'vault.key')),journalBefore=readFileSync(path.join(ready.dir,'pump-agent-launches.json'));
 const resumed=fork('tools/local-owner-preview/owner-auth-backend.mjs',[String(bp),String(fp),ready.dir],{silent:true});let resumedOutput='';
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Resume timeout')),20000);resumed.once('exit',()=>{clearTimeout(timer);reject(Error('Resume failed'));});resumed.stdout.on('data',b=>{resumedOutput+=b;for(const line of resumedOutput.split('\n'))try{if(JSON.parse(line).status==='READY'){clearTimeout(timer);resolve();}}catch{}});});assert.equal((await call(bp,'/api/state')).data.session,null);assert.deepEqual(readFileSync(path.join(ready.dir,'vault.key')),keyBefore);assert.deepEqual(readFileSync(path.join(ready.dir,'pump-agent-launches.json')),journalBefore);const preserved=new DatabaseSync(path.join(ready.dir,'fixture.sqlite'),{readOnly:true});try{assert.equal(preserved.prepare('SELECT count(*) n FROM launchpad_first_tokens').get().n,1);assert.equal(preserved.prepare('SELECT count(*) n FROM sessions').get().n,0);}finally{preserved.close();}}
 finally{const exited=once(resumed,'exit');resumed.send('shutdown');await exited;}
});
test('manual challenge validation rejects altered domain, owner, nonce, expiry and purpose',()=>{
 const origin='http://127.0.0.1:5199',expires=Date.now()+10000,id='fixture-nonce';
 const message=`TEKKTEAM isolated local owner authentication\nDomain: 127.0.0.1:5199\nOrigin: ${origin}\nWallet: ${owner}\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\nPurpose: authenticate this wallet to disposable local TEKKTEAM data only.\nNo launch, transaction, payment, funding, withdrawal or trading is authorized.`;
 const c={id,expires,message,manualApprovalRequired:true};assert.equal(validateOwnerAuthChallenge(c,owner,origin),message);
 for(const patch of [{id:'changed'},{expires:Date.now()-1},{expires:expires+1},{manualApprovalRequired:false},{message:message.replace('No launch','Approve launch')},{message:message.replace('5199','5198')}])assert.throws(()=>validateOwnerAuthChallenge({...c,...patch},owner,origin));
 assert.throws(()=>validateOwnerAuthChallenge(c,'OTHER',origin));
 const issued=1800000000000,expiry=issued+300000,clockMessage=message.replace(new Date(expires).toISOString(),new Date(expiry).toISOString()),clockChallenge={...c,expires:expiry,message:clockMessage};assert.equal(validateOwnerAuthChallenge(clockChallenge,owner,origin,issued-500),clockMessage);assert.throws(()=>validateOwnerAuthChallenge(clockChallenge,owner,origin,issued-1001));assert.throws(()=>validateOwnerAuthChallenge(clockChallenge,owner,origin,expiry));
});

test('product challenge review accepts the exact existing server message and rejects rebound fields',()=>{
 const origin='http://127.0.0.1:5199',id='product-nonce',expires=Date.now()+10000;
 const message=`TEKKTEAM wallet sign-in\nOrigin: ${origin}\nWallet: ${owner}\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\nThis signature signs you in. It does not authorize a payment.`;
 const challenge={id,expires,message};assert.equal(validateOwnerAuthChallenge(challenge,owner,origin),message);
 for(const patch of [{id:'different'},{expires:expires+1},{message:message.replace('does not authorize','authorizes')},{manualApprovalRequired:true}])assert.throws(()=>validateOwnerAuthChallenge({...challenge,...patch},owner,origin));
 assert.throws(()=>validateOwnerAuthChallenge(challenge,'OTHER',origin));assert.throws(()=>validateOwnerAuthChallenge(challenge,owner,'https://other.invalid'));
});

test('manual message page serializes challenge/verify and never calls a wallet signer',async()=>{
 const html=readFileSync('tools/local-owner-preview/auth-review.html','utf8'),script=html.split('<script type="module">')[1].split('</script>')[0].split('\n').filter(line=>!line.startsWith('import ')).join('\n'),fields=new Map();
 for(const id of ['challenge-form','verify-form','address','message','signature','status'])fields.set(id,{value:id==='address'?owner:'',hidden:false,disabled:false,textContent:''});const button={disabled:false};let resolve,calls=0;
 const context=vm.createContext({document:{getElementById:id=>fields.get(id),querySelectorAll:()=>[fields.get('address'),fields.get('signature'),button]},location:{origin:'http://127.0.0.1:5199'},validateOwnerAuthChallenge:()=> 'EXACT FIXTURE MESSAGE',fetch:()=>{calls++;return new Promise(r=>resolve=r);}});vm.runInContext(script,context);
 const event={preventDefault(){}};const first=fields.get('challenge-form').onsubmit(event);assert.equal(button.disabled,true);await fields.get('challenge-form').onsubmit(event);await fields.get('verify-form').onsubmit(event);assert.equal(calls,1);resolve({ok:true,json:async()=>({id:'fixture-nonce'})});await first;assert.equal(button.disabled,false);assert.equal(fields.get('message').textContent,'EXACT FIXTURE MESSAGE');assert.equal(fields.get('verify-form').hidden,false);assert.doesNotMatch(script,/signMessage|signTransaction|window\.solana/);
});
test('harness constructor refuses production/original paths before opening data',()=>{
 for(const args of [{dbPath:'server/data/tekkwork.sqlite'},{dbPath:path.join(mkdtempSync(path.join(tmpdir(),'tekkteam-owner-auth-')),'fixture.sqlite'),production:true}])assert.throws(()=>createServer({...args,network:'mainnet',mainnetSafetyMode:true,rpc:'https://fixture.invalid',localOwnerAuthHarness:true}),/isolated disposable/);
});
test('owner frontend still requires a distinct deliberate approval before signature',()=>{
 const backend=readFileSync('public/app/backend.js','utf8'),review=readFileSync('public/app/owner-auth-review.js','utf8');
 assert.ok(backend.indexOf('await reviewChallenge(challenge,owner)')<backend.indexOf('signSelected(id,selected,owner,connectedAccount,challenge.message)'));
 assert.match(review,/No signature requested yet/);assert.match(review,/data-auth-approve/);assert.match(review,/approved=false/);
});
test('harness refuses foreign hardlinked DB/key and supplied key before store I/O',()=>{
 const outside=mkdtempSync(path.join(tmpdir(),'tekkteam-external-test-')),foreign=path.join(outside,'sentinel');writeFileSync(foreign,'NOT A DATABASE OR KEY');
 for(const name of ['fixture.sqlite','vault.key']){const dir=mkdtempSync(path.join(tmpdir(),'tekkteam-owner-auth-'));linkSync(foreign,path.join(dir,name));assert.throws(()=>createServer({dbPath:path.join(dir,'fixture.sqlite'),network:'mainnet',mainnetSafetyMode:true,rpc:'https://fixture.invalid',origins:['http://127.0.0.1:5199'],localOwnerAuthHarness:true}),/linked data/);assert.equal(readFileSync(foreign,'utf8'),'NOT A DATABASE OR KEY');}
 const dir=mkdtempSync(path.join(tmpdir(),'tekkteam-owner-auth-'));assert.throws(()=>createServer({dbPath:path.join(dir,'fixture.sqlite'),vaultKey:Buffer.alloc(32).toString('base64'),network:'mainnet',mainnetSafetyMode:true,rpc:'https://fixture.invalid',origins:['http://127.0.0.1:5199'],localOwnerAuthHarness:true}),/foreign key/);
});
