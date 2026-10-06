// Explicit M2B profile; never an operational API or launch capability.
import {M4_TARGET} from './pump-m4-guard.js';
import {M4_EXPIRED_RECOVERY_ID,M4_REJECTED_RECOVERY_IDS} from './pump-m4-recovery.js';
export function walletTestConfig(input){
 if(!input||Object.keys(input).some(k=>!['origin','dataDir','port','rpcUrl','launchPreparation','m4Launch','m4RecoveryExecutionId','m4ActionTime','m4Lighthouse'].includes(k))||(input.launchPreparation!==undefined&&typeof input.launchPreparation!=='boolean'))throw Error('WALLET_TEST_CONFIG_INVALID');
 if(input.m4Lighthouse!==undefined&&(input.m4Lighthouse!==true||input.m4ActionTime!==true))throw Error('M4_LIGHTHOUSE_CONFIG_INVALID');
 if(input.m4ActionTime!==undefined&&(input.m4ActionTime!==true||!input.m4Launch||input.m4RecoveryExecutionId!==undefined))throw Error('M4_ACTION_TIME_CONFIG_INVALID');
 if(input.m4RecoveryExecutionId!==undefined&&(!input.m4Launch||![M4_EXPIRED_RECOVERY_ID,...M4_REJECTED_RECOVERY_IDS].includes(input.m4RecoveryExecutionId)))throw Error('M4_EXACT_RECOVERY_CONFIG_REQUIRED');
 if(input.m4Launch!==undefined&&(!input.launchPreparation||!input.m4Launch||Object.keys(input.m4Launch).length!==Object.keys(M4_TARGET).length||Object.keys(M4_TARGET).some(k=>input.m4Launch[k]!==M4_TARGET[k])))throw Error('M4_EXACT_TARGET_CONFIG_REQUIRED');
 let u;try{u=new URL(input.origin);}catch{throw Error('WALLET_TEST_HTTPS_ORIGIN_REQUIRED');}
 if(u.protocol!=='https:'||u.origin!==input.origin||u.username||u.password||u.hostname.endsWith('.')||/(?:^|\.)(localhost|local|internal)$/.test(u.hostname)||!u.hostname.includes('.')||/^\d+[.:]/.test(u.hostname)||u.hostname==='tekkteam.tech'||u.hostname==='www.tekkteam.tech')throw Error('WALLET_TEST_SEPARATE_HTTPS_ORIGIN_REQUIRED');
 if(!Number.isInteger(input.port)||input.port<1024||input.port>65535||[4190,4191,4193,4290,4291,5198,5199].includes(input.port))throw Error('WALLET_TEST_DEDICATED_PORT_REQUIRED');
 if(typeof input.dataDir!=='string'||!input.dataDir||typeof input.rpcUrl!=='string')throw Error('WALLET_TEST_CONFIG_INVALID');
 return Object.freeze({...input});
}
export function walletTestPublicAsset(method,target,preparation=false){
 return preparation&&method==='GET'&&typeof target==='string'&&(/^\/[A-Za-z0-9_-]{43}$/.test(target)||/^\/metadata\/agents\/[a-zA-Z0-9_-]{1,100}\/[a-f0-9]{64}\.png$/.test(target));
}
export function walletTestRoute(method,target,preparation=false,m4=false){
 if(typeof target!=='string'||!target.startsWith('/')||target.startsWith('//'))return false;
 if(preparation){
  if(walletTestPublicAsset(method,target,preparation))return true;
  const id='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  if(m4&&target.startsWith('/api/launchpad/agents/'+M4_TARGET.agentId+'/execution/')){const action=target.slice(target.lastIndexOf('/')+1);return method==='GET'&&['status','wallet-status'].includes(action)||method==='POST'&&['prepare','recover','review','submit','reject','estimate','wallet-prepare','wallet-claim','wallet-diagnostic'].includes(action);}
  if(method==='GET'&&new RegExp('^/api/agents/'+id+'(?:/contract|/operating-plan|/launch-lifecycle)?$').test(target))return true;
  if(method==='POST'&&(target==='/api/launchpad/agent-identities'||new RegExp('^/api/launchpad/agents/'+id+'/(token-draft|preparation)$').test(target)))return true;
 }
 if(method==='GET')return ['/api/health','/api/state','/api/wallet/mainnet-balance','/api/wallet/mainnet-balance?refresh=1','/api/runtime-capabilities'].includes(target);
 return method==='POST'&&['/api/auth/challenge','/api/auth/verify','/api/auth/logout'].includes(target);
}
export function walletTestRequest(req,{origin,port,launchPreparation=false,m4Launch}){
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress))return false;
 if(![new URL(origin).host,`127.0.0.1:${port}`].includes(req.headers.host))return false;
 if(req.headers['x-forwarded-proto']!=='https')return false;
 // These exact content-hash paths contain only validated public token metadata.
 // Owner/API requests still require the original same-origin checks below.
 if(walletTestPublicAsset(req.method,req.url,launchPreparation))return true;
 if(req.headers.origin!==undefined&&req.headers.origin!==origin)return false;
 if(req.method==='POST'&&req.headers.origin!==origin)return false;
 if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return false;
 return walletTestRoute(req.method,req.url,launchPreparation,!!m4Launch);
}
export const walletTestCapabilities=Object.freeze({mode:'M2B_WALLET_ONLY',network:'solana:101',auth:true,mainnetBalance:true,workers:false,signing:false,broadcast:false,launch:false,tokenCreation:false,funding:false,withdrawal:false,transfers:false,trading:false,publishing:false});
export const preparationCapabilities=Object.freeze({...walletTestCapabilities,mode:'M3_UNSIGNED_PREPARATION',launchPreparation:true,metadataPublication:true});
export const m4Capabilities=Object.freeze({...preparationCapabilities,mode:'M4_CONTROLLED_SINGLE_LAUNCH',controlledOwnerApproval:true,controlledSingleBroadcast:true,m4Target:M4_TARGET,guaranteeClass:'EXECUTION_GUARDED'});
