import {PublicKey} from '@solana/web3.js';
import {GENESIS} from '../../src/pump-readiness.js';
import {readAtMinimumContext} from '../pump-context-rpc.js';
import {reject} from './intent.js';

// Read-only transport. No latest-blockhash refresh, transaction construction,
// signer, account mutation or sender is available through this dependency.
export function createPumpNativeValidityReader({transport,now=Date.now}={}){
 if(typeof transport?.rpc!=='function')reject('PUMP_NATIVE_RPC_REQUIRED');
 return async({blockhash,commitment,minContextSlot})=>{
  const checkedAt=now();
  try{if(typeof blockhash!=='string'||new PublicKey(blockhash).toBase58()!==blockhash||new PublicKey(blockhash).equals(PublicKey.default))throw Error();}catch{reject('PUMP_BLOCKHASH_INVALID');}
  if(commitment!=='finalized'||!Number.isSafeInteger(minContextSlot)||minContextSlot<0)reject('PUMP_NATIVE_RPC_CONTEXT');
  const genesis=await transport.rpc('getGenesisHash',[]);if(genesis!==GENESIS)reject('PUMP_NATIVE_RPC_NETWORK');
  const config={commitment,minContextSlot};
  const [currentBlockHeight,valid]=await Promise.all([
   readAtMinimumContext(transport,'getBlockHeight',[config]),
   readAtMinimumContext(transport,'isBlockhashValid',[blockhash,config])
  ]);
  if(!Number.isSafeInteger(currentBlockHeight)||currentBlockHeight<0||!Number.isSafeInteger(valid?.context?.slot)||valid.context.slot<minContextSlot||typeof valid.value!=='boolean'||now()<checkedAt||now()-checkedAt>5000)reject('PUMP_NATIVE_RPC_RESPONSE');
  return {source:'BACKEND_RPC_READ',genesis,commitment,minContextSlot,blockhash,currentBlockHeight,blockhashValid:valid.value,blockhashValidationSlot:valid.context.slot,checkedAt};
 };
}
