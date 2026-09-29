import {Connection} from '@solana/web3.js';
import {GENESIS} from '../src/pump-readiness.js';
import {observeRpcFetch} from './dex/pre-sign-rpc-budget.js';

const roles=['agentWallet','funding','withdrawal','cpmmState','blockhash','simulation','broadcaster','reconciliation'];
const MAINNET_RPC='https://api.mainnet-beta.solana.com';
export const realMoneyRpc=env=>env.MAINNET_RPC_URL||MAINNET_RPC;

// All real-money phases use one connection. A split adapter must never be
// accepted merely because each side independently claims to be Mainnet.
export function createRealMoneyNetwork({env=process.env,connection,components}={}){
 const configured=String(env.REAL_MONEY_NETWORK||'MAINNET').toUpperCase();
 const rpcUrl=realMoneyRpc(env);
 const productionRpcConfigured=typeof env.MAINNET_RPC_URL==='string'&&/^https?:\/\//i.test(env.MAINNET_RPC_URL)&&!['api.mainnet-beta.solana.com','api.mainnet.solana.com'].includes(new URL(env.MAINNET_RPC_URL).hostname.toLowerCase());
 const selected=connection??new Connection(rpcUrl,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:observeRpcFetch});
 const endpoints=Object.freeze(Object.fromEntries(roles.map(role=>[role,components?.[role]??selected])));
 let verified=false,checkedAt=null,reason='NOT_VERIFIED';
 const status=()=>({realMoneyNetwork:configured,rpc:verified?'MAINNET VERIFIED':'UNAVAILABLE',agentWalletRpc:verified?'MAINNET':'UNAVAILABLE',cpmmStateRpc:verified?'MAINNET':'UNAVAILABLE',blockhash:verified?'MAINNET':'UNAVAILABLE',simulation:verified?'MAINNET':'UNAVAILABLE',broadcaster:verified?'MAINNET':'UNAVAILABLE',reconciliation:verified?'MAINNET':'UNAVAILABLE',networkConsistent:verified,networkCheckedAt:checkedAt,networkReason:reason});
 const verify=async()=>{
  verified=false;
  try{
   if(configured!=='MAINNET')throw Error('REAL_MONEY_NETWORK_NOT_MAINNET');
   if(env.SOLANA_MAINNET_RPC_URL&&env.SOLANA_MAINNET_RPC_URL!==rpcUrl)throw Error('REAL_MONEY_RPC_CONFIG_CONFLICT');
   if(roles.some(role=>endpoints[role]!==selected))throw Error('REAL_MONEY_RPC_TOPOLOGY_MISMATCH');
   if(await selected.getGenesisHash()!==GENESIS)throw Error('REAL_MONEY_GENESIS_MISMATCH');
   verified=true;checkedAt=Date.now();reason='MAINNET_GENESIS_AND_SINGLE_CONNECTION_VERIFIED';return status();
  }catch(e){reason=e.message||'REAL_MONEY_NETWORK_UNAVAILABLE';throw Object.assign(Error(reason),{status:503,code:reason});}
 };
 return Object.freeze({connection:selected,endpoints,verify,status,productionRpcConfigured});
}
