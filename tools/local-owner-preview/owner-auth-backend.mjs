import {createMainnetBalanceReader} from './mainnet-balance-reader.mjs';
import './outbound-guard.mjs';
import {parse} from 'dotenv';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import path from 'node:path';import {tmpdir} from 'node:os';import http from 'node:http';
import {port,trustedRequest} from './fixture-contract.mjs';
const ports={backend:port(process.argv[2]??4291),frontend:port(process.argv[3]??5199)};
const balanceEnabled=process.argv[5]==='--mainnet-balance';
if(ports.backend===ports.frontend||process.argv.length>6||(process.argv[5]&&!balanceEnabled)||[4290,5198].includes(ports.backend)||[4290,5198].includes(ports.frontend))throw Error('Dedicated owner-auth ports required');
// Parse only this canonical setting; never source .env or inherit money flags.
const balanceConfig=balanceEnabled?parse(fs.readFileSync(fileURLToPath(new URL('../../.env',import.meta.url)))).MAINNET_RPC_URL:null;
if(balanceEnabled&&!balanceConfig)throw Error('MAINNET_RPC_URL_REQUIRED_FOR_BALANCE');
const balanceReader=balanceEnabled?createMainnetBalanceReader(balanceConfig,{onRead:event=>console.log(JSON.stringify(event))}):null;
const temporaryRoot=tmpdir(),resume=process.argv[4],dir=resume?path.resolve(resume):fs.mkdtempSync(path.join(temporaryRoot,'tekkteam-owner-auth-'));
if(resume&&(!/^tekkteam-owner-auth-[a-zA-Z0-9]+$/.test(path.basename(dir))||fs.realpathSync(path.dirname(dir))!==fs.realpathSync(temporaryRoot)||fs.lstatSync(dir).isSymbolicLink()))throw Error('Owner auth resume path denied');
for(const key of Object.keys(process.env))delete process.env[key];
Object.assign(process.env,{TEMP:temporaryRoot,TMP:temporaryRoot,DATA_DIR:dir,NODE_ENV:'development',FUNDING_ENABLED:'false',WITHDRAWAL_ENABLED:'false',LIVE_TRADING_ENABLED:'false',LIVE_AUTONOMOUS_ENABLED:'false',CONTROLLED_REAL_ENABLED:'false',CONTROLLED_BUY_PREPARE_ENABLED:'false',GLOBAL_TRADING_KILL_SWITCH:'true',AUTONOMOUS_KILL_SWITCH:'true',REAL_MONEY_EMERGENCY_STOP:'true',WALLET_TRANSFERS_PAUSED:'true'});
const journalPath=path.join(dir,'pump-agent-launches.json');
if(resume){const stat=fs.lstatSync(journalPath);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error('Owner auth resume journal denied');const journal=JSON.parse(fs.readFileSync(journalPath,'utf8'));if(journal.version!==2||Object.keys(journal.receipts??{}).length)throw Error('Owner auth resume launch evidence denied');}
else fs.writeFileSync(journalPath,JSON.stringify({version:2,receipts:{}}),{flag:'wx'});
const {createServer}=await import('../../server/app.js');
const {previewSourceFingerprint}=await import('./source-fingerprint.mjs');const previewSource=previewSourceFingerprint();
const api=createServer({dbPath:path.join(dir,'fixture.sqlite'),network:'mainnet',mainnetSafetyMode:true,rpc:'https://owner-auth.invalid',origins:[`http://127.0.0.1:${ports.frontend}`],localOwnerAuthHarness:true,ownerBalanceReader:balanceReader?.read,tokenDraftOptions:{journalPath,assetRoot:path.join(dir,'pump-metadata-site'),publicOrigin:'https://owner-auth.invalid'},realMoneyNetwork:{connection:new Proxy({},{get:()=>()=>{throw Error('LOCAL_FIXTURE_OUTBOUND_DISABLED');}}),verify:async()=>{throw Error('LOCAL_FIXTURE_OUTBOUND_DISABLED');},status:()=>({realMoneyNetwork:'UNAVAILABLE',networkConsistent:false,networkReason:'LOCAL_FIXTURE_OUTBOUND_DISABLED'})}});
function permitted(method,p){
 if(balanceEnabled&&method==='GET'&&p==='/api/wallet/mainnet-balance')return true;
 if(method==='GET')return ['/api/health','/api/state','/api/strategy-registry'].includes(p)||/^\/api\/agents\/[a-zA-Z0-9_-]+(?:\/(?:contract|operating-plan|launch-lifecycle))?$/.test(p);
 return method==='POST'&&(['/api/auth/challenge','/api/auth/verify','/api/auth/logout','/api/launchpad/agent-identities'].includes(p)||/^\/api\/launchpad\/agents\/[a-zA-Z0-9_-]+\/token-draft$/.test(p));
}
const server=http.createServer((req,res)=>{
 let pathname;try{const u=new URL(req.url,`http://127.0.0.1:${ports.backend}`);const balanceQuery=balanceEnabled&&req.method==='GET'&&u.pathname==='/api/wallet/mainnet-balance'&&u.search==='?refresh=1';if(!req.url.startsWith('/')||req.url.startsWith('//')||(u.search&&!balanceQuery)||u.hash)throw Error();pathname=u.pathname;}catch{res.writeHead(403);res.end();return;}
 res.setHeader('X-TEKKTEAM-Data-Source','LOCAL_OWNER_AUTH_HARNESS');res.setHeader('Cache-Control','no-store');
 if(!trustedRequest(req,ports)||!permitted(req.method,pathname)){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'OWNER_AUTH_HARNESS_ROUTE_DENIED'}));return;}
 const end=res.end;res.end=function(body,...args){if(typeof body==='string'||Buffer.isBuffer(body))try{const data=JSON.parse(body.toString());if(['/api/state','/api/health'].includes(pathname)){body=JSON.stringify({...data,previewSource,localFixture:{dataSource:'LOCAL_OWNER_AUTH_HARNESS',authSource:'REAL_SIGNATURE_VERIFICATION',realWalletAuthenticated:!!data.session,backgroundJobs:false,publicDelivery:'UNVERIFIED'}});res.removeHeader('Content-Length');}}catch{}return end.call(this,body,...args);};
 api.app(req,res);
});
let closing=false;function close(){if(closing)return;closing=true;server.closeAllConnections?.();server.close(()=>{api.close();process.exit(0);});}
process.on('SIGINT',close);process.on('SIGTERM',close);process.on('message',m=>{if(m==='shutdown')close();});
server.on('error',()=>{api.close();process.exitCode=1;});
server.listen(ports.backend,'127.0.0.1',()=>console.log(JSON.stringify({status:'READY',ports,pid:process.pid,dir,dataSource:'LOCAL_OWNER_AUTH_HARNESS',seededSessions:0,backgroundJobs:false,outboundGuard:'PASS',balanceReadOnly:balanceEnabled,balanceRpcProvider:balanceReader?.provider,notSigned:true,notBroadcast:true})));
