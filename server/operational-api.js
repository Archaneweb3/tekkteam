import 'dotenv/config';
import { resolve } from 'node:path';
import { createServer } from './app.js';
import { backendNetwork } from '../src/networks.js';
import {runtime,logError,tokenConfiguration} from './runtime.js';
import http from 'node:http';
import {createReviewedLaunchServices} from './reviewed-launch-services.js';
import {productLaunchConfiguration,productLaunchRequest} from './product-launch-configuration.js';
import {createLaunchPreparationTransport} from './launch-preparation-transport.js';
import {createMainnetBalanceReader} from '../tools/local-owner-preview/mainnet-balance-reader.mjs';
import {preparationCapabilities,m4Capabilities} from './wallet-test-policy.js';
const config=runtime();
const selected = backendNetwork(process.env);
const reviewed=productLaunchConfiguration(process.env),tokenDraftConfiguration=tokenConfiguration(process.env);
const services=reviewed?createReviewedLaunchServices({tokenDraftConfiguration,transport:createLaunchPreparationTransport({rpcUrl:config.rpc,origin:tokenDraftConfiguration.publicOrigin,m4Target:reviewed.authorization?.target??null}),authorization:reviewed.authorization}):null;
const instance = createServer({ dbPath: resolve(process.env.DATA_DIR || (selected.network === 'mainnet' ? 'server/data/mainnet-safety' : 'server/data'), 'tekkwork.sqlite'), vaultKey: process.env.VAULT_KEY_BASE64, origins: (process.env.APP_ORIGINS || 'http://127.0.0.1:5188,http://localhost:5188').split(','), network: selected.network, rpc: selected.rpc, mainnetSafetyMode:selected.safetyMode, production: process.env.NODE_ENV === 'production', tokenDraftConfiguration,...(services?.serverOptions??{}),...(reviewed?{ownerBalanceReader:createMainnetBalanceReader(config.rpc).read}:{}) });
try{await instance.realMoney.verify();}catch(e){console.error('Real-money network unavailable:',e.code||'NETWORK_VERIFICATION_FAILED');}
const capabilities=reviewed?{...(reviewed.authorization?m4Capabilities:preparationCapabilities),profile:'PRODUCT_CONTROLLED_LAUNCH',canonicalOrigin:reviewed.origin,...(reviewed.authorization?{actionTimePreparation:true,lighthouseCompatibility:true}:{})}:{mode:'PRODUCT_MAINNET_SAFETY',launchPreparation:false,controlledOwnerApproval:false,controlledSingleBroadcast:false,trading:false};
const server=http.createServer(async(req,res)=>{
 if(reviewed&&!productLaunchRequest(req,{origin:reviewed.origin,port:config.port,launchPreparation:true,m4Launch:reviewed.authorization?.target})){res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'PRODUCT_OPERATION_DISABLED'}));return;}
 if(req.method==='GET'&&req.url==='/api/runtime-capabilities'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(capabilities));return;}
 if(services&&!req.url.startsWith('/api/')){const asset=await services.readPublicAsset(req.url);res.writeHead(asset?200:404,{'Content-Type':asset?.type??'application/json','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(asset?.bytes??'{}');return;}
 instance.app(req,res);
}).listen(config.port,config.host,()=>console.log(JSON.stringify({service:'api',status:'ready',port:config.port,liveTrading:false,reviewedLaunch:!!reviewed})));
const reconciliation = reviewed?null:setInterval(() => instance.reconcilePending().catch(() => console.error('Reconciliation unavailable; will retry')), 15000);
const walletReconciliation=reviewed?null:setInterval(()=>instance.walletReconcile().catch(e=>logError('wallet-reconciliation',e)),15000);
const paperTrading=reviewed?null:setInterval(()=>instance.paperTick().catch(e=>logError('paper-worker',e)),15000);
const collectAnalytics=()=>{try{instance.analyticsTick();}catch(e){logError('paper-analytics',e);}};
if(!reviewed)collectAnalytics();
const analytics=reviewed?null:setInterval(collectAnalytics,60000);
const close = () => { clearInterval(walletReconciliation);clearInterval(analytics); clearInterval(reconciliation);clearInterval(paperTrading); server.close(() => process.exit(0)); };
process.on('SIGINT', close); process.on('SIGTERM', close);
