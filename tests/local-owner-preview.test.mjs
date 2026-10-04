import test from'node:test';import assert from'node:assert/strict';import{fork}from'node:child_process';import http from'node:http';import net from'node:net';import{readFileSync,writeFileSync}from'node:fs';import{once}from'node:events';import{DatabaseSync}from'node:sqlite';import sharp from'sharp';import{permitted,trustedRequest,port,fixtureOwner,frontendPathAllowed}from'../tools/local-owner-preview/fixture-contract.mjs';
const free=async()=>{const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const call=(p,path,options={})=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:p,path,method:options.method??'GET',headers:options.headers??{}},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>{let data;try{data=JSON.parse(body);}catch{data=body;}resolve({status:res.statusCode,data,headers:res.headers});});});req.on('error',reject);req.end(options.body?JSON.stringify(options.body):undefined);});
async function start(file,args){const child=fork(file,args.map(String),{silent:true,env:{...process.env,DATA_DIR:'MUST_NOT_USE',VITE_API_URL:'https://MUST_NOT_USE.invalid'}});let stdout='',stderr='';child.stderr.on('data',x=>stderr+=x);const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Listener timeout: '+stderr)),25000);child.on('exit',code=>{clearTimeout(timer);reject(Error('Exited '+code+': '+stderr));});child.stdout.on('data',x=>{stdout+=x;for(const line of stdout.split('\n')){try{const data=JSON.parse(line);if(['READY','HTTP_LISTENING_NOT_QUALIFIED'].includes(data.status)){clearTimeout(timer);resolve(data);}}catch{}}});});return{child,ready,stop:async()=>{const exited=once(child,'exit');child.send('shutdown');await exited;}};}
test('fixture route and host contract deny all unrelated methods/routes/origins',()=>{for(const p of ['/api/auth/challenge','/api/auth/verify','/api/pump-agent-launch','/api/wallet','/api/trading/configure','/api/agents/a/delete','/mainnet-rpc'])for(const m of ['GET','POST','PUT','DELETE','OPTIONS'])assert.equal(permitted(m,p),false);assert.equal(permitted('POST','/api/launchpad/agent-identities'),true);assert.throws(()=>port(5188));assert.throws(()=>port(4190));assert.equal(trustedRequest({headers:{host:'evil.invalid'}},{frontend:5198,backend:4290}),false);});
test('actual bootstrap public config import allowed, other server/private paths denied',()=>{
 assert.match(readFileSync('src/bootstrap.js','utf8'),/\.\.\/server\/config\.js/);
 assert.equal(frontendPathAllowed('/server/config.js','/@fs/cache/'),true);
 for(const p of ['/server/app.js','/server/data','/server/config.js/secret','/.env','/tools/local-owner-preview/owner-backend.mjs','/artifacts/private.json','/@fs/other/browser-session.json','/server/../config.js'])assert.equal(frontendPathAllowed(p,'/@fs/cache/'),false,p);
 assert.equal(frontendPathAllowed('/@fs/cache/deps/lucide.js','/@fs/cache/'),true);
 assert.match(readFileSync('tools/local-owner-preview/owner-frontend.mjs','utf8'),/path\.join\(root,'server\/config\.js'\)/);
});
test('disposable actual owner HTTP, immutable save/replay, guards and shutdown (frontend optional, separately unqualified)',async(t)=>{
 const bp=await free(),fp=await free(),b=await start('tools/local-owner-preview/owner-backend.mjs',[bp,fp]);let f;
 try{
 assert.equal(b.ready.outboundGuard,'PASS');assert.equal(b.ready.backgroundJobs,false);assert.match(b.ready.dir,/tekkteam-owner-fixture-/);assert.ok(!b.ready.dir.includes('server/data'));
 const sessions=JSON.parse(readFileSync(b.ready.sessionPath));const cookie=label=>'tw_session='+sessions.cookies.find(c=>c.label===label).value;
 const headers={'Content-Type':'application/json',Origin:`http://127.0.0.1:${fp}`,Cookie:cookie('owner'),'idempotency-key':'FIXTURE_IDENTITY_KEY'};
 const post=(p,body,h=headers)=>call(bp,p,{method:'POST',headers:h,body});
 const health=(await call(bp,'/api/health')).data;
 for(const key of ['fundingEnabled','withdrawalEnabled','liveTradingEnabled','controlledRealEnabled','controlledRealRequested','controlledPrepareReviewEnabled','broadcastEnabled','trading'])assert.equal(health[key],false,key);
 for(const key of ['globalTradingKillSwitch','autonomousKillSwitch','realMoneyEmergencyStop','walletTransfersPaused','safetyMode'])assert.equal(health[key],true,key);
 assert.equal(health.realMoneyNetwork,'UNAVAILABLE');assert.equal((await call(bp,'/api/state')).data.session,null);
 for(const p of ['/api/auth/challenge','/api/auth/verify','/api/auth/logout','/api/pump-agent-launch','/api/wallet','/api/wallet/mainnet-balance','/api/trading/network','/api/network','/api/funding','/api/withdrawal','/api/agents/a/delete','/mainnet-rpc'])for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'])assert.equal((await call(bp,p,{method})).status,403,method+' '+p);
 for(const p of ['/api/state','/api/health','/api/strategy-registry','/api/launchpad/agent-identities'])for(const method of ['PUT','PATCH','DELETE','OPTIONS'])assert.equal((await call(bp,p,{method})).status,403);
 assert.equal((await call(bp,'/api/strategy-registry')).status,200);
 assert.equal((await post('/api/launchpad/agent-identities',{name:'No owner',character:'frank',strategy:'balanced'},{...headers,Cookie:''})).status,401);
 for(const c of ['expired'])assert.equal((await post('/api/launchpad/agent-identities',{name:'Expired',character:'frank',strategy:'balanced'},{...headers,Cookie:cookie(c)})).status,401);
 assert.equal((await post('/api/launchpad/agent-identities',{}, {...headers,Origin:'https://evil.invalid'})).status,403);
 assert.equal((await post('/api/launchpad/agent-identities',{}, {...headers,Origin:''})).status,403);
 assert.equal((await call(bp,'/api/state',{headers:{Host:'evil.invalid'}})).status,403);
 assert.equal((await call(bp,'/api/state',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 for(const path of ['/api/auth/challenge','/api/pump-agent-launch','/api/trading/configure','/api/wallet'])assert.equal((await post(path,{})).status,403);
 assert.equal((await call(bp,'/api/state?unsafe=1')).status,403);
 const identity=await post('/api/launchpad/agent-identities',{name:'LOCAL_FIXTURE Agent',character:'frank',strategy:'balanced'});assert.equal(identity.status,201);const id=identity.data.id;
 const owned=await call(bp,'/api/agents/'+id+'/contract',{headers});assert.equal(owned.data.tokenDraft.save.allowed,true);
 for(const p of ['/api/agents/'+id,'/api/agents/'+id+'/contract','/api/agents/'+id+'/operating-plan','/api/agents/'+id+'/launch-lifecycle']){assert.equal((await call(bp,p,{headers})).status,200);for(const label of ['expired','other'])assert.equal((await call(bp,p,{headers:{Cookie:cookie(label)}})).status,label==='expired'?401:404);assert.equal((await call(bp,p)).status,401);}
 assert.equal((await call(bp,'/api/agents/'+id,{headers:{Cookie:cookie('other')}})).status,404);
 assert.equal((await call(bp,'/api/agents/'+id,{headers:{Cookie:'tw_session=WRONG'}})).status,401);
 const png=await sharp({create:{width:2,height:2,channels:4,background:'#ffda54'}}).png().toBuffer();const body={draft:{name:'LOCAL_FIXTURE Coin',ticker:'FIX'},expectedRevision:0,tokenImage:'data:image/png;base64,'+png.toString('base64')};const th={...headers,'idempotency-key':'FIXTURE_TOKEN_KEY'};const path='/api/launchpad/agents/'+id+'/token-draft';
 assert.equal((await post(path,{...body,expectedRevision:1},th)).status,400);
 for(const label of ['other','expired'])assert.equal((await post(path,body,{...th,Cookie:cookie(label)})).status,label==='other'?404:401);
 assert.equal((await post(path,body,{...th,Cookie:''})).status,401);
 assert.equal((await post(path,body,{...th,'idempotency-key':''})).status,400);
 assert.ok((await post(path,{draft:{name:'Fixture',ticker:'FIX',image:'https://owner-fixture.invalid/metadata/agents/wrong/000.png'},expectedRevision:0},th)).status>=400);
 const saved=await post(path,body,th);assert.equal(saved.status,201);assert.equal(saved.data.imageAuthority.publicDelivery,'UNVERIFIED');
 const journal=JSON.stringify({version:2,receipts:{[id]:{agentId:id,owner:fixtureOwner,network:'solana:101',status:'Unknown',signature:'LOCAL_FIXTURE_UNVERIFIED_SIGNATURE',broadcastAttempted:true}}});writeFileSync(b.ready.journalPath,journal);
 const replay=await post(path,body,th);assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);assert.equal(readFileSync(b.ready.journalPath,'utf8'),journal);
 assert.equal((await post(path,{...body,draft:{name:'Changed',ticker:'FIX'}},th)).status,409);
 const state=await call(bp,'/api/state',{headers});assert.equal(state.data.session.address,fixtureOwner);assert.equal(state.data.agents.length,1);assert.equal(state.data.events.filter(e=>e.type==='token-configured').length,1);assert.equal(state.data.config.mainnetSafetyMode,true);
 if(process.env.TEKKTEAM_PREVIEW_SKIP_FRONTEND==='1'){t.diagnostic('Frontend NOT RUN: known optimizer ancestor access denial; final-source API/isolation tests only.');}else{
 f=await start('tools/local-owner-preview/owner-frontend.mjs',[fp,bp]);const home=await call(fp,'/');assert.equal(home.status,200);assert.doesNotMatch(home.data,/FIXTURE OWNER|TEST MODE|Test Mode/);assert.match(home.headers['content-security-policy'],/connect-src 'self'/);
 assert.equal((await call(fp,'/api/state',{headers})).data.session.address,fixtureOwner);assert.equal((await call(fp,'/app/workspace.js')).status,200);
 const adapter=await call(fp,'/app/backend.js');assert.equal(adapter.status,200);for(const match of adapter.data.matchAll(/from\s*["']([^"']+)["']/g)){if(match[1].startsWith('/@fs/'))assert.equal((await call(fp,match[1])).status,200);}
 for(const p of ['/.env','/server/data','/@fs/'+b.ready.sessionPath.replaceAll('\\','/')])assert.ok((await call(fp,p)).status>=400);
 assert.equal((await call(fp,'/',{headers:{Origin:'https://evil.invalid'}})).status,403);
 assert.equal((await call(fp,'/api/auth/challenge',{method:'POST',headers,body:{}})).status,403);
 }
 }finally{if(f)await f.stop();await b.stop();}
 await assert.rejects(call(bp,'/api/health'),/ECONNREFUSED/);
 await assert.rejects(call(fp,'/'),/ECONNREFUSED/);
 const db=new DatabaseSync(b.ready.dir+'/fixture.sqlite',{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) n FROM launchpad_first_tokens').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM requests').get().n,2);const row=db.prepare('SELECT data,secret FROM agents').get();assert.equal(row.secret,null);assert.equal(JSON.parse(row.data).coin.name,'LOCAL_FIXTURE Coin');}finally{db.close();}
});
