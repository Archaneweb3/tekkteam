import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReviewedLaunchServices} from '../server/reviewed-launch-services.js';
import {productLaunchConfiguration,productLaunchRequest} from '../server/product-launch-configuration.js';
import {M4_TARGET} from '../server/pump-m4-guard.js';
const env={REVIEWED_LAUNCH_ENABLED:'true',NODE_ENV:'production',SOLANA_NETWORK:'MAINNET',REAL_MONEY_NETWORK:'MAINNET',MAINNET_SAFETY_MODE:'true',APP_ORIGINS:'https://tekkteam.tech'};
for(const flag of ['FUNDING_ENABLED','WITHDRAWAL_ENABLED','LIVE_TRADING_ENABLED','LIVE_AUTONOMOUS_ENABLED','CONTROLLED_REAL_ENABLED','CONTROLLED_BUY_PREPARE_ENABLED'])env[flag]='false';
for(const flag of ['GLOBAL_TRADING_KILL_SWITCH','AUTONOMOUS_KILL_SWITCH','REAL_MONEY_EMERGENCY_STOP','WALLET_TRANSFERS_PAUSED','PAPER_TRADING_KILL_SWITCH'])env[flag]='true';
test('canonical launch requires explicit mode and every effect lock',()=>{
 assert.equal(productLaunchConfiguration({}),null);
 assert.equal(productLaunchConfiguration({...env,REVIEWED_LAUNCH_ENABLED:'false'}),null);
 assert.equal(productLaunchConfiguration(env).authorization,null);
 for(const [flag,value] of Object.entries(env)){
  assert.throws(()=>productLaunchConfiguration({...env,[flag]:value==='true'?'TRUE':value==='false'?'true':'untrusted'}),undefined,flag);
 }
 assert.equal(productLaunchConfiguration({...env,REVIEWED_LAUNCH_M4_TARGET:JSON.stringify(M4_TARGET)}).authorization.lighthouse,true);
 assert.throws(()=>productLaunchConfiguration({...env,REVIEWED_LAUNCH_M4_TARGET:JSON.stringify({...M4_TARGET,ceilingLamports:10000001})}),/EXACT_TARGET/);
});
test('product mode denies all unrelated effects, accepts same-origin owner reads',()=>{
 const cfg={origin:'https://tekkteam.tech',port:4190,launchPreparation:true,m4Launch:M4_TARGET};
 const req=(method,url)=>({method,url,headers:{host:'tekkteam.tech',origin:cfg.origin,'x-forwarded-proto':'https','sec-fetch-site':'same-origin'},socket:{remoteAddress:'127.0.0.1'}});
 const base='/api/agents/'+M4_TARGET.agentId+'/trading';
 for(const path of [base+'/wallet',base+'/funding/prepare',base+'/funding/submit',base+'/withdrawal/prepare',base+'/withdrawal/submit',base+'/enable','/api/pump-launch/prepare','/api/pump-launch/submit','/api/dex/submit'])assert.equal(productLaunchRequest(req('POST',path),cfg),false,path);
 for(const path of [base,base+'/wallet',base+'/analytics','/api/auth/challenge','/api/launchpad/agents/'+M4_TARGET.agentId+'/execution/wallet-prepare'])assert.equal(productLaunchRequest(req(path.includes('/auth/')||path.endsWith('wallet-prepare')?'POST':'GET',path),cfg),true,path);
 const foreign=req('GET',base);foreign.headers.origin='https://staging.tekkteam.tech';assert.equal(productLaunchRequest(foreign,cfg),false);
 const direct=req('GET',base);direct.socket.remoteAddress='8.8.8.8';assert.equal(productLaunchRequest(direct,cfg),false);
 const unauth=req('POST','/api/auth/challenge');delete unauth.headers.origin;assert.equal(productLaunchRequest(unauth,cfg),false);
});
test('shared composition never invents absent history or attaches M4 by default',()=>{
 const dataDir=mkdtempSync(join(tmpdir(),'tekkteam-composition-'));
 try{
  const configuration={dataDir,assetRoot:join(dataDir,'pump-metadata-site'),journalPath:join(dataDir,'pump-agent-launches.json'),publicOrigin:'https://metadata.tekkteam.tech',publisherOrigin:'https://metadata.tekkteam.tech'};
  let calls=0;const transport={rpc:async()=>{calls++;throw Error('unexpected network');},publicRequest:async()=>{calls++;throw Error('unexpected publication');}};
  assert.throws(()=>createReviewedLaunchServices({tokenDraftConfiguration:configuration,transport}),/ENOENT/);
  writeFileSync(configuration.journalPath,JSON.stringify({version:2,receipts:{}}));
  const service=createReviewedLaunchServices({tokenDraftConfiguration:configuration,transport});
  assert.equal(typeof service.serverOptions.launchPreparation,'function');assert.equal(service.serverOptions.m4ExecutionFactory,undefined);assert.equal(calls,0);
  assert.throws(()=>createReviewedLaunchServices({tokenDraftConfiguration:configuration,transport,authorization:{target:M4_TARGET,actionTime:true,lighthouse:true}}),/CONTROLLED_TRANSPORT/);
  const approved=createReviewedLaunchServices({tokenDraftConfiguration:configuration,transport:{...transport,submitOnce:async()=>{calls++;}},authorization:{target:M4_TARGET,actionTime:true,lighthouse:true}});
  assert.equal(typeof approved.serverOptions.m4ExecutionFactory,'function');assert.equal(calls,0,'Composition never signs, publishes, simulates or broadcasts');
 }finally{rmSync(dataDir,{recursive:true,force:true});}
});
test('native IncomingMessage prototype headers survive the inactive-plan gate',async t=>{
 const http=await import('node:http');const cfg={origin:'https://tekkteam.tech',port:4190};
 const server=http.createServer((req,res)=>{let allowed;try{allowed=productLaunchRequest(req,cfg);}catch(error){res.writeHead(500);res.end(error.message);return;}res.writeHead(allowed?200:403);res.end();});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const post=(path,origin=cfg.origin)=>new Promise((resolve,reject)=>{const q=http.request({host:'127.0.0.1',port:server.address().port,path,method:'POST',headers:{host:'tekkteam.tech',origin,'x-forwarded-proto':'https','sec-fetch-site':'same-origin'}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));});q.on('error',reject);q.end();});
 const base='/api/agents/'+M4_TARGET.agentId;
 for(const suffix of ['/activation-plan','/activation-plan/cancel','/publication'])assert.equal(await post(base+suffix),200);
 assert.equal(await post(base+'/activation-plan','https://evil.example'),403);
 for(const suffix of ['/activation-plan/approve','/activation-plan/activate','/trading/funding/submit','/trading/enable'])assert.equal(await post(base+suffix),403);
});
