// Capture only the existing genesis/getBalance transport before sealing effects.
import {createMainnetBalanceReader} from '../tools/local-owner-preview/mainnet-balance-reader.mjs';
import {createLaunchPreparationTransport} from './launch-preparation-transport.js';
import './http-only-outbound.js';
import http from 'node:http';
import {readFileSync,writeFileSync,readdirSync,realpathSync,lstatSync} from 'node:fs';
import {isAbsolute,resolve,join,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {walletTestConfig,walletTestRequest,walletTestCapabilities,preparationCapabilities,m4Capabilities} from './wallet-test-policy.js';
import {createReviewedLaunchServices} from './reviewed-launch-services.js';
import {readReceiptJournal} from './launch-receipt-journal.js';

export async function startWalletTest(args=process.argv.slice(2)){
 if(args[0]!=='--wallet-test'||args[1]!=='--config'||!args[2]||args.length>4||(args[3]&&args[3]!=='--initialize'))throw Error('WALLET_TEST_EXPLICIT_CONFIG_REQUIRED');
 let parsed;try{parsed=JSON.parse(readFileSync(args[2],'utf8'));}catch{throw Error('WALLET_TEST_CONFIG_UNREADABLE');}
 const cfg=walletTestConfig(parsed);
 const reader=createMainnetBalanceReader(cfg.rpcUrl);
 const capabilities=cfg.m4Launch?{...m4Capabilities,...(cfg.m4RecoveryExecutionId?{m4RecoveryExecutionId:cfg.m4RecoveryExecutionId}:{}),...(cfg.m4ActionTime?{actionTimePreparation:true,...(cfg.m4Lighthouse?{lighthouseCompatibility:true}:{})}:{})}:cfg.launchPreparation?preparationCapabilities:walletTestCapabilities;
 if(!isAbsolute(cfg.dataDir))throw Error('WALLET_TEST_ABSOLUTE_DATA_REQUIRED');
 const dir=resolve(cfg.dataDir);
 for(let p=dir;;p=dirname(p)){if(lstatSync(p).isSymbolicLink())throw Error('WALLET_TEST_LINK_DENIED');if(dirname(p)===p)break;}
 if(realpathSync(dir)!==dir)throw Error('WALLET_TEST_LINK_DENIED');
 const marker=join(dir,'wallet-test-runtime.json'),keyPath=join(dir,'wallet-test.key'),dbPath=join(dir,'wallet-test.sqlite');
 if(args[3]==='--initialize'){
  if(readdirSync(dir).length)throw Error('WALLET_TEST_INITIALIZATION_REQUIRES_EMPTY_DIRECTORY');
  writeFileSync(keyPath,randomBytes(32),{flag:'wx',mode:0o600});
  writeFileSync(marker,JSON.stringify({version:1,profile:'M2B_WALLET_ONLY',origin:cfg.origin}),{flag:'wx',mode:0o600});
 }else{
  for(const name of ['wallet-test-runtime.json','wallet-test.key','wallet-test.sqlite']){const st=lstatSync(join(dir,name));if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)throw Error('WALLET_TEST_STORE_INVALID');}
 }
 for(const name of readdirSync(dir)){
  if(cfg.launchPreparation&&name==='pump-agent-launches.json'){readReceiptJournal(join(dir,name));continue;}
  if(cfg.launchPreparation&&name==='pump-metadata-site'){
   const safeTree=path=>{const s=lstatSync(path);if(s.isSymbolicLink()||(!s.isDirectory()&&(!s.isFile()||s.nlink!==1)))throw Error('WALLET_TEST_LINK_DENIED');if(s.isDirectory())for(const child of readdirSync(path))safeTree(join(path,child));};safeTree(join(dir,name));continue;
  }
  if(!['wallet-test-runtime.json','wallet-test.key','wallet-test.sqlite','wallet-test.sqlite-wal','wallet-test.sqlite-shm'].includes(name))throw Error('WALLET_TEST_FOREIGN_DATA_DENIED');
  const s=lstatSync(join(dir,name));if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)throw Error('WALLET_TEST_LINK_DENIED');
 }
 const descriptor=JSON.parse(readFileSync(marker,'utf8'));
 if(descriptor.version!==1||descriptor.profile!=='M2B_WALLET_ONLY'||descriptor.origin!==cfg.origin)throw Error('WALLET_TEST_ORIGIN_BINDING_MISMATCH');
 const key=readFileSync(keyPath);if(key.length!==32)throw Error('WALLET_TEST_KEY_INVALID');
 let preparationOptions={},readAsset=null;
 if(cfg.launchPreparation){
  // Canonical staging journal must be provisioned explicitly; never assume legacy absence.
  readReceiptJournal(join(dir,'pump-agent-launches.json'));
  const tokenDraftConfiguration={dataDir:dir,assetRoot:join(dir,'pump-metadata-site'),journalPath:join(dir,'pump-agent-launches.json'),publicOrigin:cfg.origin,publisherOrigin:cfg.origin};
  const transport=createLaunchPreparationTransport({rpcUrl:cfg.rpcUrl,origin:cfg.origin,m4Target:cfg.m4Launch??null});
  const services=createReviewedLaunchServices({tokenDraftConfiguration,transport,authorization:cfg.m4Launch?{target:cfg.m4Launch,recoverExecutionId:cfg.m4RecoveryExecutionId,actionTime:cfg.m4ActionTime,lighthouse:cfg.m4Lighthouse}:null});
  readAsset=services.readPublicAsset;preparationOptions=services.serverOptions;
 }
 for(const k of Object.keys(process.env))delete process.env[k];
 Object.assign(process.env,{NODE_ENV:'production',DATA_DIR:dir,SOLANA_NETWORK:'MAINNET',MAINNET_SAFETY_MODE:'true',REAL_MONEY_NETWORK:'MAINNET',FUNDING_ENABLED:'false',WITHDRAWAL_ENABLED:'false',LIVE_TRADING_ENABLED:'false',LIVE_AUTONOMOUS_ENABLED:'false',CONTROLLED_REAL_ENABLED:'false',CONTROLLED_BUY_PREPARE_ENABLED:'false',GLOBAL_TRADING_KILL_SWITCH:'true',AUTONOMOUS_KILL_SWITCH:'true',REAL_MONEY_EMERGENCY_STOP:'true',WALLET_TRANSFERS_PAUSED:'true',PAPER_TRADING_KILL_SWITCH:'true'});
 const denied=()=>{throw Object.assign(Error('WALLET_TEST_EFFECT_DISABLED'),{code:'WALLET_TEST_EFFECT_DISABLED'});};
 const {createServer}=await import('./app.js');
 const api=createServer({dbPath,vaultKey:key.toString('base64'),production:true,network:'mainnet',mainnetSafetyMode:true,rpc:'https://wallet-test.invalid',origins:[cfg.origin],ownerBalanceReader:reader.read,...preparationOptions,realMoneyNetwork:{connection:new Proxy(Object.create(null),{get:()=>denied}),verify:async()=>denied(),status:()=>({realMoneyNetwork:'UNAVAILABLE',networkConsistent:false,networkReason:'WALLET_TEST_EXECUTION_DISABLED'})}});
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(!walletTestRequest(req,cfg)){res.writeHead(403);res.end(JSON.stringify({error:'WALLET_TEST_OPERATION_DISABLED'}));return;}
  if(req.url==='/api/runtime-capabilities'){res.end(JSON.stringify(capabilities));return;}
  if(readAsset&&!req.url.startsWith('/api/')){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Cross-Origin-Resource-Policy','cross-origin');const asset=await readAsset(req.url);if(!asset){res.writeHead(404);res.end(JSON.stringify({error:'Metadata asset unavailable'}));return;}res.setHeader('Content-Type',asset.type);res.setHeader('X-Content-Type-Options','nosniff');res.end(asset.bytes);return;}
  api.app(req,res);
 });
 let closed=false;const close=()=>{if(closed)return;closed=true;server.closeAllConnections();server.close(()=>{api.close();if(process.connected)process.disconnect();});};
 process.once('SIGINT',close);process.once('SIGTERM',close);process.on('message',m=>{if(m==='shutdown')close();});
 try{await new Promise((ok,no)=>{server.once('error',no);server.listen(cfg.port,'127.0.0.1',ok);});}catch(error){api.close();throw error;}
 console.log(JSON.stringify({status:'WALLET_TEST_READY',origin:cfg.origin,port:cfg.port,capabilities}));
 return {server,close};
}
