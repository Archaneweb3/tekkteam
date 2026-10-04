// Local composition of the existing product factories. No dotenv import.
import './http-only-outbound.js';
import http from 'node:http';
import {isAbsolute,join,resolve,dirname} from 'node:path';
import {lstatSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';

const denied=()=>{throw Object.assign(Error('HTTP_ONLY_EFFECT_DISABLED'),{code:'HTTP_ONLY_EFFECT_DISABLED'});};
const connection=new Proxy(Object.create(null),{get:()=>denied});
export function httpOnlyRoute(method,path){
 if(method==='GET')return ['/api/health','/api/state','/api/strategy-registry'].includes(path)||/^\/api\/agents\/[a-zA-Z0-9_-]+(?:\/(?:contract|operating-plan|launch-lifecycle))?$/.test(path);
 return method==='POST'&&(['/api/auth/challenge','/api/auth/verify','/api/auth/logout','/api/launchpad/agent-identities'].includes(path)||/^\/api\/launchpad\/agents\/[a-zA-Z0-9_-]+\/token-draft$/.test(path));
}
export async function startHttpOnly(kind,args=process.argv.slice(2)){
 const options={};
 for(let i=0;i<args.length;i++){
  const key=args[i];if(key==='--http-only'){if(options.mode)throw Error('HTTP_ONLY_ARGUMENTS');options.mode=true;continue;}
  if(!['--data-dir','--port','--origin','--metadata-origin'].includes(key)||options[key]!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw Error('HTTP_ONLY_ARGUMENTS');options[key]=args[++i];
 }
 if(!options.mode||!['api','launch'].includes(kind)||!isAbsolute(options['--data-dir']??''))throw Error('HTTP_ONLY_EXPLICIT_DATA_REQUIRED');
 const port=Number(options['--port']);if(!Number.isInteger(port)||port<1024||port>65535||[5199,4291,5198,4290].includes(port))throw Error('HTTP_ONLY_PORT_REQUIRED');
 const origin=options['--origin'];if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin??'')||new URL(origin).origin!==origin)throw Error('HTTP_ONLY_LOOPBACK_ORIGIN_REQUIRED');
 const dataDir=resolve(options['--data-dir']);
 for(let p=dataDir;;p=dirname(p)){if(lstatSync(p).isSymbolicLink())throw Error('HTTP_ONLY_DATA_LINK_DENIED');if(dirname(p)===p)break;}
 if(realpathSync(dataDir)!==dataDir)throw Error('HTTP_ONLY_DATA_LINK_DENIED');
 const file=name=>{const p=join(dataDir,name),s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)throw Error('HTTP_ONLY_EXISTING_DATA_REQUIRED');return p;};
 const dbPath=file('tekkwork.sqlite'),journal=file('pump-agent-launches.json');
 for(const sidecar of ['tekkwork.sqlite-wal','tekkwork.sqlite-shm']){
  try{file(sidecar);}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 // Verify provenance before openStore can initialize schemas or load custody keys.
 const db=new DatabaseSync(dbPath,{readOnly:true});
 try{if(db.prepare("SELECT value FROM settings WHERE key='network_binding'").get()?.value!=='mainnet')throw Error('HTTP_ONLY_MAINNET_DATA_REQUIRED');}finally{db.close();}
 const {readReceiptJournal}=await import('./launch-receipt-journal.js');readReceiptJournal(journal);
 if(kind==='api')file('vault.key');
 const metadataOrigin=options['--metadata-origin'];if(metadataOrigin){const u=new URL(metadataOrigin);if(u.protocol!=='https:'||u.origin!==metadataOrigin||u.username||u.password)throw Error('HTTP_ONLY_METADATA_ORIGIN_INVALID');}
 const temporaryRoot=tmpdir();for(const key of Object.keys(process.env))delete process.env[key];
 Object.assign(process.env,{TEMP:temporaryRoot,TMP:temporaryRoot,DATA_DIR:dataDir,NODE_ENV:'development',SOLANA_NETWORK:'MAINNET',MAINNET_SAFETY_MODE:'true',REAL_MONEY_NETWORK:'MAINNET',FUNDING_ENABLED:'false',WITHDRAWAL_ENABLED:'false',CONTROLLED_REAL_ENABLED:'false',CONTROLLED_BUY_PREPARE_ENABLED:'false',LIVE_TRADING_ENABLED:'false',LIVE_AUTONOMOUS_ENABLED:'false',GLOBAL_TRADING_KILL_SWITCH:'true',AUTONOMOUS_KILL_SWITCH:'true',REAL_MONEY_EMERGENCY_STOP:'true',WALLET_TRANSFERS_PAUSED:'true',PAPER_TRADING_KILL_SWITCH:'true'});
 let instance,app;
 if(kind==='api'){
  const {createServer}=await import('./app.js');
  instance=createServer({dbPath,origins:[origin],network:'mainnet',mainnetSafetyMode:true,rpc:'https://http-only.invalid',realMoneyNetwork:{connection,verify:async()=>denied(),status:()=>({realMoneyNetwork:'UNAVAILABLE',networkConsistent:false,networkReason:'HTTP_ONLY_EFFECT_DISABLED'})},tokenDraftConfiguration:{dataDir,journalPath:journal,assetRoot:join(dataDir,'pump-metadata-site'),publicOrigin:metadataOrigin,publisherOrigin:metadataOrigin}});app=instance.app;
 }else{
  const {createPumpLaunch}=await import('./pump-launch.js');
  app=createPumpLaunch({journal,origins:[origin],serviceHost:`127.0.0.1:${port}`,connection,prepare:denied,send:denied,publishMetadata:denied,removeMetadata:denied,getAgent:denied});
 }
 const capabilities=Object.freeze({mode:'HTTP_ONLY',service:kind,workers:false,signing:false,broadcast:false,publishing:false,funding:false,withdrawal:false,live:false,launchPreparation:false});
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  const reject=()=>{res.writeHead(403);res.end(JSON.stringify({error:'HTTP_ONLY_OPERATION_DISABLED'}));};
  if(![`127.0.0.1:${port}`,new URL(origin).host].includes(req.headers.host)||(req.headers.origin&&req.headers.origin!==origin)||(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site'])))return reject();
  let pathname;try{const u=new URL(req.url,origin);if(!req.url.startsWith('/')||req.url.startsWith('//')||u.search||u.hash||u.pathname!==req.url)throw Error();pathname=u.pathname;}catch{return reject();}
  if(req.method==='GET'&&pathname===(kind==='api'?'/api/runtime-capabilities':'/pump-launch/health')){res.end(JSON.stringify(capabilities));return;}
  if(kind==='launch'||!httpOnlyRoute(req.method,pathname))return reject();
  app(req,res);
 });
 let closed=false;const close=()=>{if(closed)return;closed=true;server.closeAllConnections();server.close(()=>{instance?.close();if(process.connected)process.disconnect();});};
 process.once('SIGINT',close);process.once('SIGTERM',close);process.on('message',message=>{if(message==='shutdown')close();});
 server.once('error',()=>{instance?.close();process.exitCode=1;});
 await new Promise((ok,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',ok);});
 console.log(JSON.stringify({status:'HTTP_ONLY_READY',port,...capabilities}));
 return {server,close};
}
