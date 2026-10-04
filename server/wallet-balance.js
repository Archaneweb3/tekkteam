import {Connection,PublicKey} from '@solana/web3.js';
import {GENESIS} from '../src/pump-readiness.js';
export function mainnetWalletBalance({connection,verifyNetwork,now=Date.now}={}){
 const c=connection??new Connection(process.env.MAINNET_RPC_URL||'https://api.mainnet-beta.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true});
 const cache=new Map(),pending=new Map();
 return async(owner,force=false)=>{
  const old=cache.get(owner);if(old&&now()-old.checkedAt<(force?1000:15000))return old;
  if(pending.has(owner))return pending.get(owner);
  const task=(async()=>{try{
   if(verifyNetwork)await verifyNetwork();else if(await c.getGenesisHash()!==GENESIS)throw Object.assign(Error('Wrong network'),{code:'BALANCE_RPC_NETWORK_MISMATCH'});
   const response=await c.getBalanceAndContext(new PublicKey(owner),'confirmed');
   const {value,context}=response??{};
   if(!Number.isSafeInteger(value)||value<0||!Number.isSafeInteger(context?.slot)||context.slot<0)throw Object.assign(Error('Invalid balance'),{code:'BALANCE_RPC_RESPONSE_INVALID'});
   const r={owner,network:'solana:101',lamports:value,slot:context.slot,checkedAt:now()};cache.set(owner,r);
   if(cache.size>500)cache.delete(cache.keys().next().value);return r;
  }catch(error){cache.delete(owner);const safeCodes=['BALANCE_RPC_NETWORK_MISMATCH','BALANCE_RPC_RATE_LIMITED','BALANCE_RPC_HTTP_FAILED','BALANCE_RPC_DNS_FAILED','BALANCE_RPC_RESPONSE_INVALID','BALANCE_RPC_TIMEOUT','BALANCE_RPC_UNREACHABLE'];throw Object.assign(Error('Mainnet balance unavailable'),{code:safeCodes.includes(error.code)?error.code:'BALANCE_RPC_UNREACHABLE'});}finally{pending.delete(owner);}})();
  pending.set(owner,task);return task;
 };
}
