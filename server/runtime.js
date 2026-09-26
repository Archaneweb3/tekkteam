import {resolve,join,isAbsolute} from 'node:path';
export function runtime(env=process.env){
 const production=env.NODE_ENV==='production',origins=(env.APP_ORIGINS||'http://127.0.0.1:5188,http://localhost:5188').split(',').map(x=>x.trim());
 if(production){
  for(const key of ['DATA_DIR','VAULT_KEY_BASE64','MAINNET_RPC_URL','APP_ORIGINS','PUBLIC_METADATA_ORIGIN'])if(!env[key])throw Error('Missing production configuration: '+key);
  if(!isAbsolute(env.DATA_DIR)||Buffer.from(env.VAULT_KEY_BASE64,'base64').length!==32)throw Error('Invalid production storage/key configuration');
  for(const value of [...origins,env.PUBLIC_METADATA_ORIGIN]){const u=new URL(value);if(u.protocol!=='https:'||u.origin!==value||['localhost','127.0.0.1'].includes(u.hostname))throw Error('Production requires explicit HTTPS origins');}
  if(new URL(env.MAINNET_RPC_URL).protocol!=='https:')throw Error('Production RPC must use HTTPS');
 }
 // No live adapter is approved. Even an accidental flag change must fail closed.
 if(env.LIVE_TRADING_ENABLED&&env.LIVE_TRADING_ENABLED!=='false')throw Error('Live trading is locked: approved DEX executor unavailable');
 return {production,origins,dataDir:resolve(env.DATA_DIR||'server/data'),host:env.BACKEND_HOST||'127.0.0.1',port:Number(env.PORT||4190),launchPort:Number(env.LAUNCH_PORT||4193),apiInternal:env.API_INTERNAL_URL||'http://127.0.0.1:4190',launchInternal:env.LAUNCH_INTERNAL_URL||'http://127.0.0.1:4193',rpc:env.MAINNET_RPC_URL||'https://api.mainnet-beta.solana.com',liveEnabled:false,fundingEnabled:env.FUNDING_ENABLED==='true',killSwitch:env.GLOBAL_TRADING_KILL_SWITCH!=='false'};
}
export const dataPath=(name)=>join(resolve(process.env.DATA_DIR||'server/data'),name);
export function logError(component,error){console.error(JSON.stringify({time:new Date().toISOString(),level:'error',component,errorType:error?.name||'Error'}));}
