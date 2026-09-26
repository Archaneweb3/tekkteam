import {Connection,PublicKey} from '@solana/web3.js';
import {GENESIS} from '../src/pump-readiness.js';
export function mainnetWalletBalance({connection,now=Date.now}={}){
 const c=connection??new Connection(process.env.MAINNET_RPC_URL||'https://api.mainnet-beta.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true});
 const cache=new Map(),pending=new Map();
 return async(owner,force=false)=>{
  const old=cache.get(owner);if(old&&now()-old.checkedAt<(force?1000:15000))return old;
  if(pending.has(owner))return pending.get(owner);
  const task=(async()=>{try{
   if(await c.getGenesisHash()!==GENESIS)throw Error('Wrong network');
   const {value,context}=await c.getBalanceAndContext(new PublicKey(owner),'confirmed');
   if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid balance');
   const r={owner,network:'solana:101',lamports:value,slot:context.slot,checkedAt:now()};cache.set(owner,r);
   if(cache.size>500)cache.delete(cache.keys().next().value);return r;
  }catch{cache.delete(owner);throw Error('Mainnet balance unavailable');}finally{pending.delete(owner);}})();
  pending.set(owner,task);return task;
 };
}
