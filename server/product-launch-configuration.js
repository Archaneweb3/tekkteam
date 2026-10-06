import {M4_TARGET} from './pump-m4-guard.js';
import {walletTestRequest} from './wallet-test-policy.js';

// Explicit product opt-in; an environment typo never falls back to legacy launch.
// This grants no general wallet, funding or trading capability.
export function productLaunchConfiguration(env=process.env){
 if(env.REVIEWED_LAUNCH_ENABLED===undefined||env.REVIEWED_LAUNCH_ENABLED==='false')return null;
 if(env.REVIEWED_LAUNCH_ENABLED!=='true')throw Error('REVIEWED_LAUNCH_FLAG_INVALID');
 if(env.NODE_ENV!=='production'||env.SOLANA_NETWORK!=='MAINNET'||env.REAL_MONEY_NETWORK!=='MAINNET'||env.MAINNET_SAFETY_MODE!=='true')throw Error('REVIEWED_LAUNCH_MAINNET_SAFETY_REQUIRED');
 for(const flag of ['FUNDING_ENABLED','WITHDRAWAL_ENABLED','LIVE_TRADING_ENABLED','LIVE_AUTONOMOUS_ENABLED','CONTROLLED_REAL_ENABLED','CONTROLLED_BUY_PREPARE_ENABLED'])if(env[flag]!=='false')throw Error('REVIEWED_LAUNCH_EFFECT_LOCK_REQUIRED:'+flag);
 for(const flag of ['GLOBAL_TRADING_KILL_SWITCH','AUTONOMOUS_KILL_SWITCH','REAL_MONEY_EMERGENCY_STOP','WALLET_TRANSFERS_PAUSED','PAPER_TRADING_KILL_SWITCH'])if(env[flag]!=='true')throw Error('REVIEWED_LAUNCH_KILL_SWITCH_REQUIRED:'+flag);
 const origins=(env.APP_ORIGINS||'').split(',');
 if(origins.length!==1||origins[0]!=='https://tekkteam.tech')throw Error('REVIEWED_LAUNCH_CANONICAL_ORIGIN_REQUIRED');
 let authorization=null;
 if(env.REVIEWED_LAUNCH_M4_TARGET!==undefined){
  let target;try{target=JSON.parse(env.REVIEWED_LAUNCH_M4_TARGET);}catch{throw Error('M4_EXACT_TARGET_CONFIG_REQUIRED');}
  if(!target||Object.keys(target).length!==Object.keys(M4_TARGET).length||Object.keys(M4_TARGET).some(k=>target[k]!==M4_TARGET[k]))throw Error('M4_EXACT_TARGET_CONFIG_REQUIRED');
  authorization={target,actionTime:true,lighthouse:true};
  if(env.REVIEWED_LAUNCH_POLICY101_FILE!==undefined){if(!/^[a-f0-9]{64}$/.test(env.REVIEWED_LAUNCH_POLICY101_SHA256??''))throw Error('POLICY101_APPROVAL_HASH_REQUIRED');authorization.isolation={path:env.REVIEWED_LAUNCH_POLICY101_FILE,sha256:env.REVIEWED_LAUNCH_POLICY101_SHA256};}
 }
 return {origin:origins[0],authorization};
}

export function productLaunchRequest(req,configuration){
 if(req.method==='POST'&&/^\/api\/agents\/[a-f0-9-]{36}\/publication$/.test(req.url))return walletTestRequest({method:req.method,url:'/api/auth/challenge',headers:req.headers,socket:req.socket},configuration);
 // Inactive owner plan persistence only. There is deliberately no activate,
 // approve, funding or execution route in this exception.
 if(req.method==='POST'&&/^\/api\/agents\/[a-f0-9-]{36}\/activation-plan(\/cancel)?$/.test(req.url))return walletTestRequest({method:req.method,url:'/api/auth/challenge',headers:req.headers,socket:req.socket},configuration);
 // Keep owner-scoped product reads available. Only mutation authority is narrowed
 // to the reviewed preparation/one-shot endpoints and the existing owner auth.
 if(['GET','HEAD'].includes(req.method)&&req.url.startsWith('/api/')){
  return walletTestRequest({method:'GET',url:'/api/state',headers:req.headers,socket:req.socket},configuration);
 }
 return walletTestRequest(req,configuration);
}
