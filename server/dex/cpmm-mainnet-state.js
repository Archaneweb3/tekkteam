import {PublicKey,VersionedTransaction} from '@solana/web3.js';
import {getAssociatedTokenAddressSync} from '@solana/spl-token';
import {CPMM,inspectCpmmSnapshot,quoteCpmm} from './concrete-cpmm-proof.js';
import {buildCpmmEnvelope,CPMM_ENVELOPE,cpmmEnvelopeContext} from './cpmm-envelope.js';
import {validateDexTransaction} from './transaction-validator.js';
import {SOL_MINT,reject,DEFAULT_RISK_POLICY} from './intent.js';
import {preSignRpcReader,withPreSignRpcScope,retryAfterFrom,isRateLimited} from './pre-sign-rpc-budget.js';

export const CONTROLLED_CPMM_POOL='7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny';
export const CONTROLLED_USDC_MINT='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const pk=x=>new PublicKey(x);
const at=(bytes,offset)=>new PublicKey(bytes.subarray(offset,offset+32)).toBase58();
const raw=(address,info)=>({address,owner:info?.owner.toBase58()??null,length:info?.data.length??null,data:info?.data.toString('base64')??null,lamports:info?.lamports??null,executable:info?.executable??false});
const SNAPSHOT_MAX_AGE_MS=10000;
export const MIN_CONTEXT_RETRY=Object.freeze({maxAttempts:3,backoffMs:[120,240],rateLimitBackoffMs:[500,1000],maxWindowMs:5000});
const snapshotFailure=(code,diagnostic)=>{throw Object.assign(Error(code),{code,status:409,snapshotDiagnostic:diagnostic});};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const retryDetail=(attempt,diagnostic,errorCode)=>({attempt,timestamp:Date.now(),poolContextSlot:diagnostic?.poolFetchContextSlot??null,requestedMinContextSlot:diagnostic?.minContextSlot??null,dependentContextSlot:diagnostic?.dependentFetchContextSlot??null,currentRpcSlot:diagnostic?.currentRpcSlot??null,accountCountExpected:diagnostic?.accountCountExpected??null,accountCountReceived:diagnostic?.accountCountReceived??null,rpcErrorCode:errorCode});

// Every account comes from RPC. Pool keys are only discovery hints until the
// independent PDA/schema/provenance inspector accepts the complete snapshot.
async function loadFreshCpmmPolicyOnce(connection,intent,{now=Date.now,deferBuild=false}={}){
 if(intent.network!=='solana:mainnet'||!['BUY','SELL'].includes(intent.direction)||intent.agentWallet==null)reject('INVALID_CPMM_INTENT');
 const buy=intent.direction==='BUY';
 const tokenMint=buy?intent.outputMint:intent.inputMint,pool=intent.pool??CONTROLLED_CPMM_POOL;
 if(intent.mode==='LIVE_AUTONOMOUS'&&!intent.pool||tokenMint===SOL_MINT||intent.inputMint!==(buy?SOL_MINT:tokenMint)||intent.outputMint!==(buy?tokenMint:SOL_MINT))reject('UNSUPPORTED_EXECUTION_VENUE');
 try{if(pk(pool).toBase58()!==pool||pk(tokenMint).toBase58()!==tokenMint)reject('UNSUPPORTED_EXECUTION_VENUE');}catch{reject('UNSUPPORTED_EXECUTION_VENUE');}
 const genesis=await connection.getGenesisHash();if(genesis!==MAINNET)reject('WRONG_NETWORK');
 const poolInfo=await connection.getAccountInfoAndContext(pk(pool),'confirmed');
 const poolFetchedAt=now();
 if(!poolInfo.value||poolInfo.value.owner.toBase58()!==CPMM.toBase58()||poolInfo.value.data.length!==637)reject('POOL_PROVENANCE_FAILED');
 const b=poolInfo.value.data;
 const addresses=[pool,CPMM.toBase58(),...Array.from({length:10},(_,i)=>at(b,8+i*32))];
 const unique=[...new Set(addresses)];
 const wsolAta=getAssociatedTokenAddressSync(pk(SOL_MINT),pk(intent.agentWallet)).toBase58();
 const tokenAta=getAssociatedTokenAddressSync(pk(tokenMint),pk(intent.agentWallet)).toBase58();
 const all=[...unique,wsolAta,tokenAta,intent.agentWallet];
 const snapshotDiagnostic={poolFetchContextSlot:poolInfo.context.slot,dependentFetchContextSlot:null,currentRpcSlot:null,poolFetchedAt,dependentSnapshotFetchedAt:null,quoteEvaluatedAt:null,slotDelta:null,ageMs:null,maxAgeMs:SNAPSHOT_MAX_AGE_MS,accountCountExpected:all.length,accountCountReceived:null,minContextSlot:poolInfo.context.slot,source:'FRESH_MAINNET_RPC',cacheTtlMs:null};
 const currentSlot=async()=>typeof connection.getSlot==='function'?connection.getSlot('confirmed').catch(()=>null):null;
 // Discovery is necessarily two RPC calls: the pool names its vaults/mints.
 // Fence the second read to at least the first response's context slot.
 let fetched;
 try{fetched=await connection.getMultipleAccountsInfoAndContext(all.map(pk),{commitment:'confirmed',minContextSlot:poolInfo.context.slot});}
 catch(e){
  if(e?.code===-32016){snapshotDiagnostic.currentRpcSlot=await currentSlot();snapshotDiagnostic.quoteEvaluatedAt=now();snapshotDiagnostic.ageMs=snapshotDiagnostic.quoteEvaluatedAt-poolFetchedAt;snapshotFailure('RPC_MIN_CONTEXT_SLOT_NOT_REACHED',snapshotDiagnostic);}
  throw e;
 }
 snapshotDiagnostic.dependentSnapshotFetchedAt=now();
 snapshotDiagnostic.dependentFetchContextSlot=fetched.context.slot;
 snapshotDiagnostic.slotDelta=fetched.context.slot-poolInfo.context.slot;
 snapshotDiagnostic.accountCountReceived=fetched.value.length;
 snapshotDiagnostic.quoteEvaluatedAt=now();
 snapshotDiagnostic.ageMs=snapshotDiagnostic.quoteEvaluatedAt-snapshotDiagnostic.dependentSnapshotFetchedAt;
 if(fetched.value.length!==all.length||fetched.context.slot<poolInfo.context.slot){
  snapshotDiagnostic.currentRpcSlot=await currentSlot();
  snapshotFailure(fetched.value.length!==all.length?'POOL_SNAPSHOT_LENGTH_MISMATCH':'STALE_POOL_SNAPSHOT',snapshotDiagnostic);
 }
 const map=new Map(all.map((a,i)=>[a,fetched.value[i]]));
 const refreshedPool=map.get(pool);
 if(!refreshedPool||refreshedPool.owner.toBase58()!==CPMM.toBase58()||refreshedPool.data.length!==637||
  Array.from({length:10},(_,i)=>at(refreshedPool.data,8+i*32)).some((address,i)=>address!==at(b,8+i*32)))reject('POOL_ROLES_CHANGED_DURING_SNAPSHOT');
 // Dynamic reserves/fee counters may change between the discovery read and
 // the fenced dependent read. Only the second, coherent account set is quoted.
 if(map.get(CPMM.toBase58())?.executable!==true||map.get('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')?.executable!==true)reject('CPMM_PROGRAM_UNAVAILABLE');
 const observedAt=now();
 const snapshot={observedAt:new Date(observedAt).toISOString(),genesis,slot:fetched.context.slot,accounts:unique.map(a=>raw(a,map.get(a)))};
 const s=inspectCpmmSnapshot(snapshot,pool);
 if(![s.mint0,s.mint1].includes(SOL_MINT)||![s.mint0,s.mint1].includes(tokenMint)||s.mint0===s.mint1)reject('UNSUPPORTED_EXECUTION_VENUE');
 const agentInfo=map.get(intent.agentWallet);if(!agentInfo||agentInfo.owner.toBase58()!=='11111111111111111111111111111111')reject('AGENT_ACCOUNT_UNAVAILABLE');
 const rentLamports=await connection.getMinimumBalanceForRentExemption(165,'confirmed');
 if(!Number.isSafeInteger(rentLamports)||rentLamports<=0)reject('RENT_UNAVAILABLE');
 const {value:latest,context:blockContext}=await connection.getLatestBlockhashAndContext('confirmed');
 snapshotDiagnostic.currentRpcSlot=blockContext.slot;
 snapshotDiagnostic.quoteEvaluatedAt=now();
 snapshotDiagnostic.ageMs=snapshotDiagnostic.quoteEvaluatedAt-observedAt;
 if(blockContext.slot<fetched.context.slot||snapshotDiagnostic.ageMs>SNAPSHOT_MAX_AGE_MS)snapshotFailure('STALE_CPMM_SNAPSHOT',snapshotDiagnostic);
 const policy={envelope:CPMM_ENVELOPE,intent,snapshot,agentAccounts:[wsolAta,tokenAta].map(a=>({address:a,info:map.get(a)?raw(a,map.get(a)):null})),rentLamports:String(rentLamports),networkFeeCapLamports:DEFAULT_RISK_POLICY.maxNetworkFeeLamports,agentBalanceLamports:String(agentInfo.lamports),computeBudget:{units:200000,microLamports:0},blockhash:latest.blockhash};
 const context=cpmmEnvelopeContext(policy);
 const collected={policy,context,lastValidBlockHeight:latest.lastValidBlockHeight,observedAt,slot:snapshot.slot,pool,routePolicyVersion:CPMM_ENVELOPE,snapshotDiagnostic};
 return deferBuild?collected:buildVerifiedCpmmFromPolicy(collected);
}

// Opt-in is restricted to callers that have proved they are still before the
// balance reservation and custody boundary. Each attempt starts at the pool
// read, so no partially collected account set or prior minContextSlot is used.
export async function loadFreshCpmmPolicy(connection,intent,{now=Date.now,deferBuild=false,retryMinContextSlot=false,retryWait=sleep}={}){
 if(!retryMinContextSlot)return loadFreshCpmmPolicyOnce(connection,intent,{now,deferBuild});
 if(intent.mode!=='AUTONOMOUS_ACCEPTANCE_TEST')reject('RPC_RETRY_MODE_FORBIDDEN');
 const started=Date.now(),attempts=[];let lastError;
 const reader=preSignRpcReader(connection);
 for(let attempt=1;attempt<=MIN_CONTEXT_RETRY.maxAttempts;attempt++){
  const remaining=MIN_CONTEXT_RETRY.maxWindowMs-(Date.now()-started);
  if(remaining<=0)break;
  try{
   // Await the whole attempt. A Promise.race timeout would leave orphan RPC
   // calls running and could overlap the next retry or a later tick.
   const result=await withPreSignRpcScope(()=>loadFreshCpmmPolicyOnce(reader,intent,{now,deferBuild}));
   if(Date.now()-started>MIN_CONTEXT_RETRY.maxWindowMs)throw Object.assign(Error('RPC_STATE_ACQUISITION_TIMEOUT'),{code:'RPC_STATE_ACQUISITION_TIMEOUT'});
   attempts.push(retryDetail(attempt,result.snapshotDiagnostic,null));
   return {...result,retryDiagnostics:attempts};
  }catch(e){
   const rateLimited=isRateLimited(e),code=rateLimited?'RPC_RATE_LIMITED':e.code;
   if(rateLimited)e.code=code;
   lastError=e;
   attempts.push(retryDetail(attempt,e.snapshotDiagnostic,rateLimited?429:e.code==='RPC_MIN_CONTEXT_SLOT_NOT_REACHED'?-32016:e.code??null));
   e.retryDiagnostics=attempts;
   const behindPool=e.code==='STALE_POOL_SNAPSHOT'&&Number.isSafeInteger(e.snapshotDiagnostic?.dependentFetchContextSlot)&&e.snapshotDiagnostic.dependentFetchContextSlot<e.snapshotDiagnostic.minContextSlot;
   const behindSnapshot=e.code==='STALE_CPMM_SNAPSHOT'&&Number.isSafeInteger(e.snapshotDiagnostic?.currentRpcSlot)&&e.snapshotDiagnostic.currentRpcSlot<e.snapshotDiagnostic.dependentFetchContextSlot;
   const retryable=rateLimited||e.code==='RPC_MIN_CONTEXT_SLOT_NOT_REACHED'||behindPool||behindSnapshot;
   if(!retryable||attempt===MIN_CONTEXT_RETRY.maxAttempts)throw e;
   const delay=rateLimited?Math.max(MIN_CONTEXT_RETRY.rateLimitBackoffMs[attempt-1],retryAfterFrom(e)??0):MIN_CONTEXT_RETRY.backoffMs[attempt-1];
   if(Date.now()-started+delay>=MIN_CONTEXT_RETRY.maxWindowMs)break;
   await retryWait(delay);
  }
 }
 throw Object.assign(lastError??Error('RPC_STATE_ACQUISITION_TIMEOUT'),{code:lastError?.code??'RPC_STATE_ACQUISITION_TIMEOUT',retryDiagnostics:attempts,retryBudgetExhausted:true});
}

// Used after the atomic capital hold. No RPC refresh or quote recomputation is
// allowed between this build and the exact-message validator/simulation.
export function buildVerifiedCpmmFromPolicy(collected){
 const transaction=buildCpmmEnvelope(collected.policy);
 const validation=validateDexTransaction(transaction,collected.policy);
 if(validation.status!=='SUPPORTED_BY_VALIDATOR'||validation.unexplainedWritableAccounts!==0)reject('CPMM_VALIDATOR_REJECTED');
 return {...collected,transaction,validation};
}

export async function simulateUnsignedCpmm(connection,prepared){
 const tx=VersionedTransaction.deserialize(Buffer.from(prepared.transaction,'base64'));
 if(tx.signatures.length!==1||tx.signatures[0].some(x=>x!==0))reject('SIGNED_SIMULATION_FORBIDDEN');
 const result=await connection.simulateTransaction(tx,{commitment:'confirmed',sigVerify:false,replaceRecentBlockhash:false});
 return {slot:result.context.slot,error:result.value.err,unitsConsumed:result.value.unitsConsumed??null,success:result.value.err===null};
}

export function cpmmReview(prepared){
 const {policy,context,validation}=prepared;
 const protectedLamports=BigInt(DEFAULT_RISK_POLICY.minReserveLamports)+BigInt(DEFAULT_RISK_POLICY.futureSellFeeLamports)+BigInt(DEFAULT_RISK_POLICY.reconciliationMarginLamports);
 const balance=BigInt(policy.agentBalanceLamports),input=context.buy?context.q.amount:0n;
 const peak=balance-input-context.rentCost-BigInt(policy.networkFeeCapLamports);
 const tokenMint=policy.intent.direction==='BUY'?policy.intent.outputMint:policy.intent.inputMint;
 const token=tokenMint===CONTROLLED_USDC_MINT?{name:'USD Coin',symbol:'USDC',mint:tokenMint}:{name:null,symbol:null,mint:tokenMint};
 return {network:'solana:mainnet',venue:'Raydium CPMM',pool:prepared.pool,token,direction:policy.intent.direction,inputAmount:policy.intent.inputAmount,estimatedOutput:context.q.output.toString(),minimumOutput:context.q.minimumOutput.toString(),slippageBps:policy.intent.slippageBps,agentBalanceLamports:policy.agentBalanceLamports,accountRentPeakLamports:context.rentCost.toString(),networkFeeCapLamports:policy.networkFeeCapLamports,protectedReserveLamports:DEFAULT_RISK_POLICY.minReserveLamports,futureSellFeeReserveLamports:DEFAULT_RISK_POLICY.futureSellFeeLamports,safetyMarginLamports:DEFAULT_RISK_POLICY.reconciliationMarginLamports,totalProtectedLamports:protectedLamports.toString(),peakAvailableAfterLamports:peak.toString(),validator:validation.status,unexplainedWritableAccounts:validation.unexplainedWritableAccounts,observedAt:prepared.observedAt,slot:prepared.slot};
}

// A status reload has only the persisted execution, not the transient quote
// context. Keep the canonical input and all intermediate arithmetic in BigInt.
export function cpmmReviewFromExecution(r){
 const input=BigInt(r.intent.inputAmount);
 const output=BigInt(r.quote.estimatedOutput);
 const minimumOutput=BigInt(r.quote.minimumOutput);
 const rentCost=BigInt(r.review.ataRentLamports);
 return cpmmReview({policy:r.validationPolicy,context:{buy:r.intent.direction==='BUY',q:{amount:input,output,minimumOutput},rentCost},validation:{status:'SUPPORTED_BY_VALIDATOR',unexplainedWritableAccounts:0},pool:r.pool,observedAt:r.preparedAt,slot:r.snapshotSlot});
}
