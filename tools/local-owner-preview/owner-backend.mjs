// Disposable LOCAL_FIXTURE preview. Not server/index.js, not a product edit.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import http2 from 'node:http2';import dns from 'node:dns';import dgram from 'node:dgram';import child from 'node:child_process';import workers from 'node:worker_threads';import {syncBuiltinESMExports} from 'node:module';


function denied(){throw Object.assign(Error('LOCAL_FIXTURE_OUTBOUND_DISABLED'),{code:'LOCAL_FIXTURE_OUTBOUND_DISABLED'});}
function block(object,key){if(key in object)Object.defineProperty(object,key,{value:denied,writable:false,configurable:false});}
for(const key of ['connect','createConnection'])block(net,key);block(net.Socket.prototype,'connect');block(tls,'connect');
for(const object of [http,https])for(const key of ['request','get'])block(object,key);block(http2,'connect');block(dgram,'createSocket');
Object.defineProperty(dns,'lookup',{value:function(host,...args){if(host!=='127.0.0.1')return denied();const callback=args.at(-1);if(typeof callback!=='function')return denied();process.nextTick(()=>args[0]?.all?callback(null,[{address:'127.0.0.1',family:4}]):callback(null,'127.0.0.1',4));},writable:false,configurable:false});
for(const key of Object.keys(dns))if(key!=='lookup'&&typeof dns[key]==='function')block(dns,key);for(const key of Object.keys(dns.promises))if(typeof dns.promises[key]==='function')block(dns.promises,key);
for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])block(child,key);block(workers,'Worker');
Object.defineProperty(globalThis,'fetch',{value:async()=>denied(),writable:false,configurable:false});if('WebSocket' in globalThis)block(globalThis,'WebSocket');
syncBuiltinESMExports();
// Verify denials before importing any application dependency. No network request occurs.
for(const attempt of [()=>net.connect(1,'127.0.0.1'),()=>new net.Socket().connect(1,'127.0.0.1'),()=>tls.connect(1),()=>http.get('http://127.0.0.1'),()=>https.get('https://example.invalid'),()=>http2.connect('https://example.invalid'),()=>dgram.createSocket('udp4'),()=>dns.lookup('example.invalid'),()=>child.spawn('node'),()=>new workers.Worker('x')]){try{attempt();throw Error('OUTBOUND_GUARD_FAILED');}catch(e){if(e.code!=='LOCAL_FIXTURE_OUTBOUND_DISABLED')throw e;}}
try{await fetch('https://example.invalid');throw Error('FETCH_GUARD_FAILED');}catch(e){if(e.code!=='LOCAL_FIXTURE_OUTBOUND_DISABLED')throw e;}

const {fixtureOwner,fixtureOtherOwner,defaultPorts,port,permitted,trustedRequest,provenance}=await import('./fixture-contract.mjs');
const previewSource=(await import('./source-fingerprint.mjs')).previewSourceFingerprint();
const ports={backend:port(process.argv[2]??defaultPorts.backend),frontend:port(process.argv[3]??defaultPorts.frontend)};
if(ports.backend===ports.frontend)throw Error('Distinct ports required');
const {tmpdir}=await import('node:os');
if(process.argv.length>5)throw Error('Only optional fixture resume path accepted');
const resumed=!!process.argv[4];
const dir=resumed?(await import('./fixture-resume.mjs')).validateFixtureResume(process.argv[4],ports):fs.mkdtempSync(path.join(tmpdir(),'tekkteam-owner-fixture-'));
for(const key of Object.keys(process.env))delete process.env[key];
Object.assign(process.env,{DATA_DIR:dir,NODE_ENV:'development',PUBLIC_METADATA_ORIGIN:'https://owner-fixture.invalid',FUNDING_ENABLED:'false',WITHDRAWAL_ENABLED:'false',LIVE_TRADING_ENABLED:'false',LIVE_AUTONOMOUS_ENABLED:'false',CONTROLLED_REAL_ENABLED:'false',CONTROLLED_BUY_PREPARE_ENABLED:'false',GLOBAL_TRADING_KILL_SWITCH:'true',AUTONOMOUS_KILL_SWITCH:'true',REAL_MONEY_EMERGENCY_STOP:'true',WALLET_TRANSFERS_PAUSED:'true'});
const journalPath=path.join(dir,'pump-agent-launches.json');
if(!resumed)fs.writeFileSync(journalPath,JSON.stringify({version:2,receipts:{}}),{flag:'wx'});
const {createServer}=await import('../../server/app.js');
const api=createServer({dbPath:path.join(dir,'fixture.sqlite'),network:'mainnet',mainnetSafetyMode:true,rpc:'https://owner-fixture.invalid',origins:[`http://127.0.0.1:${ports.frontend}`],tokenDraftOptions:{journalPath,assetRoot:path.join(dir,'pump-metadata-site'),publicOrigin:'https://owner-fixture.invalid'},realMoneyNetwork:{connection:new Proxy({},{get:()=>denied}),verify:async()=>denied(),status:()=>({realMoneyNetwork:'UNAVAILABLE',rpc:'UNAVAILABLE',networkConsistent:false,networkReason:'LOCAL_FIXTURE_OUTBOUND_DISABLED'})}});
const expires=Date.now()+4*3600_000;
const sessions={};
for(const [label,owner,expiry]of resumed?[]:[['owner',fixtureOwner,expires],['other',fixtureOtherOwner,expires],['expired',fixtureOwner,Date.now()-1000]]){
 const value=crypto.randomBytes(32).toString('hex');api.store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(crypto.createHash('sha256').update(value).digest('hex'),owner,expiry);sessions[label]=value;
}
// Synthetic secrets stay only in this disposable store/profile descriptor, never stdout/logs.
const sessionPath=path.join(dir,'browser-session.json');
if(!resumed)fs.writeFileSync(sessionPath,JSON.stringify({origin:`http://127.0.0.1:${ports.frontend}`,cookies:Object.entries(sessions).map(([label,value])=>({label,name:'tw_session',value,domain:'127.0.0.1',path:'/api',httpOnly:true,sameSite:'Strict',secure:false,expires:expires/1000})),...provenance}),{flag:'wx',mode:0o600});
const logPath=path.join(dir,'events.jsonl');let sequence=0;
let logWarning=false;
const log=data=>{try{fs.appendFileSync(logPath,JSON.stringify({time:new Date().toISOString(),pid:process.pid,...data})+'\n');}catch{if(!logWarning){logWarning=true;console.error('LOCAL_PREVIEW_LOG_UNAVAILABLE');}}};
const server=http.createServer((req,res)=>{
 let pathname;try{const u=new URL(req.url,`http://127.0.0.1:${ports.backend}`);if(!req.url.startsWith('/')||req.url.startsWith('//')||u.search||u.hash)throw Error();pathname=u.pathname;}catch{res.writeHead(403);res.end();return;}
 const id=++sequence;res.once('finish',()=>log({event:'REQUEST',id,method:req.method,path:pathname,status:res.statusCode}));
 res.setHeader('X-TEKKTEAM-Data-Source','LOCAL_FIXTURE');res.setHeader('Cache-Control','no-store');
 if(!trustedRequest(req,ports)||!permitted(req.method,pathname)){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'LOCAL_FIXTURE_ENDPOINT_OR_ORIGIN_DENIED'}));return;}
 const end=res.end;res.end=function(body,...args){if(typeof body==='string'||Buffer.isBuffer(body)){try{const data=JSON.parse(body.toString());if(pathname==='/api/state'||pathname==='/api/health'){body=JSON.stringify({...data,localFixture:provenance,previewSource});res.removeHeader('Content-Length');}}catch{}}return end.call(this,body,...args);};
 api.app(req,res);
});
let closing=false;
const close=signal=>{if(closing)return;closing=true;log({event:'STOP',signal});server.closeAllConnections?.();server.close(()=>{api.close();log({event:'CLOSED'});process.exit(0);});};
process.on('SIGINT',()=>close('SIGINT'));process.on('SIGTERM',()=>close('SIGTERM'));
// IPC is available only to the local test supervisor, never through HTTP.
process.on('message',m=>{if(m==='shutdown')close('IPC');});
server.on('error',e=>{log({event:'ERROR',code:e.code});api.close();process.exitCode=1;});
server.listen(ports.backend,'127.0.0.1',()=>{if(server.address().address!=='127.0.0.1')throw Error('Loopback required');log({event:'READY',ports,resumed});console.log(JSON.stringify({status:'READY',pid:process.pid,ports,dir,sessionPath,logPath,journalPath,resumed,...provenance,outboundGuard:'PASS'}));});

