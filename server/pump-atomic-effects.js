import {Transaction,PublicKey} from '@solana/web3.js';
import {inspectCreation} from '../src/pump-readiness.js';
import {inspectFinalCreation} from '../src/pump-final-structure.js';
const fail=code=>Object.assign(Error(code),{code,status:409});
const valid=n=>Number.isSafeInteger(n)&&n>=0;
export function canonicalExecutionStructure(result){
 const structure=inspectCreation(Buffer.from(result.transactionBase64,'base64'),{mint:new PublicKey(result.mint),blockhash:result.recentBlockhash,genesis:result.genesis,chainId:result.network,launch:result.launch,feePolicy:result.feePolicy??null});
 if(JSON.stringify(structure)!==JSON.stringify(result.structure))throw fail('EXECUTION_STRUCTURE_CHANGED');
 return structure;
}
// RPC pre/post balance arrays are collected around the SAME simulated execution.
// Their order is compiled-message order, not instruction/IDL account order.
// External observations remain separate context/drift telemetry, never a whitelist.
export function atomicExecutionEffects(result,{simulation,feeResponse,before,afterRead},decodedPolicy,finalBase64=null){
 const bytes=Buffer.from(finalBase64??result.transactionBase64,'base64');
 const structure=finalBase64?inspectFinalCreation(bytes,{mint:new PublicKey(result.mint),blockhash:result.recentBlockhash,genesis:result.genesis,chainId:result.network,launch:result.launch,feePolicy:result.feePolicy??null,finalMessageResult:result,finalMessageRequiresAllSignatures:true}):canonicalExecutionStructure(result);
 const v=simulation?.value,tx=Transaction.from(bytes),keys=tx.compileMessage().accountKeys.map(k=>k.toBase58()),accounts=structure.accounts;
 if(v?.err!==null||!Array.isArray(v.preBalances)||!Array.isArray(v.postBalances)||v.preBalances.length!==keys.length||v.postBalances.length!==keys.length||![...v.preBalances,...v.postBalances].every(valid)||!valid(v.fee)||v.fee!==feeResponse.value||new Set(keys).size!==keys.length||!Array.isArray(v.accounts)||v.accounts.length!==accounts.length||accounts.length!==keys.length||new Set(accounts.map(a=>a.address)).size!==keys.length||(v.loadedAddresses?.readonly?.length??0)!==0||(v.loadedAddresses?.writable?.length??0)!==0)throw fail('EXECUTION_ATOMIC_BALANCES_UNPROVEN');
 const effects=accounts.map((a,i)=>{
  const index=keys.indexOf(a.address),post=v.accounts[i];
  if(index<0||post===undefined||(post!==null&&!valid(post.lamports))||v.postBalances[index]!== (post===null?0:post.lamports))throw fail('EXECUTION_ATOMIC_BALANCES_MISMATCH');
  const preLamports=v.preBalances[index],postLamports=v.postBalances[index],deltaLamports=postLamports-preLamports;
  if(!a.writable&&deltaLamports!==0)throw fail('EXECUTION_ATOMIC_READONLY_CHANGED');
  if(a.name!=='user'&&deltaLamports<0)throw fail('EXECUTION_UNEXPECTED_ACCOUNT_DEBIT');
  return {name:a.name,address:a.address,writable:a.writable,signer:a.signer,compiledAccountIndex:index,preLamports,postLamports,deltaLamports};
 });
 if(effects.reduce((n,a)=>n+BigInt(a.deltaLamports),0n)!==-BigInt(v.fee))throw fail('EXECUTION_ATOMIC_BALANCES_NOT_RECONCILED');
 const owner=effects.find(a=>a.name==='user');
 if(!owner||owner.preLamports!==before.value[5]?.lamports||owner.preLamports!==afterRead.value[5]?.lamports||-owner.deltaLamports!==decodedPolicy.validatedOverheadLamports||-owner.deltaLamports!==decodedPolicy.estimatedPayerDebitLamports)throw fail('EXECUTION_ATOMIC_PAYER_MISMATCH');
 return effects;
}
