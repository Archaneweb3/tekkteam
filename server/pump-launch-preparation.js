// M3 unsigned evidence only. No receipt mutation, private mint key, signer or sender.
import {randomBytes,createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {buildCreation,inspectCreation,creationAccounts,PUMP,GENESIS} from '../src/pump-readiness.js';
import {evaluateSimulation} from '../src/pump-simulation-policy.js';
import {parseInitialBuy,initialBuyAccounts,FEE_RECIPIENT,BUYBACK_RECIPIENT} from '../src/initial-buy.js';
import {PREPARATION_IDL} from './launch-preparation-transport.js';
import {preparationFingerprint} from './preparation-evidence.js';
import {selectFeePolicy,feeComponents} from '../src/pump-fee-policy.js';
import {createExecutionReview,assertExecutionReview,contextSlot} from './pump-execution-review.js';
const failure=code=>Object.assign(Error(code),{code,status:503});
const hash=b=>createHash('sha256').update(b).digest('hex');
const expectedArgs=[['name','string'],['symbol','string'],['uri','string'],['creator','pubkey'],['is_mayhem_mode','bool'],['is_cashback_enabled',{defined:{name:'OptionBool'}}],['creator_fee_bps',{defined:{name:'OptionU64'}}],['is_holder_reward',{defined:{name:'OptionBool'}}]];
function checkAccounts(definition,accounts){if(definition?.accounts?.length!==accounts.length)throw failure('PREPARATION_IDL_ACCOUNT_MISMATCH');definition.accounts.forEach((a,i)=>{const e=accounts[i];if(a.name!==e.name||!!a.writable!==e.isWritable||!!a.signer!==e.isSigner||(a.address&&a.address!==e.pubkey.toBase58()))throw failure('PREPARATION_IDL_ACCOUNT_MISMATCH');});}
import {readAtMinimumContext} from './pump-context-rpc.js';
export {readAtMinimumContext} from './pump-context-rpc.js';
export function createPumpLaunchPreparation({transport,publishMetadata,readPreparation,executionReview=false,explicitM4Fees=false,now=Date.now,mintFactory,captureProof,captureDiagnostics}){
 if(explicitM4Fees&&!executionReview)throw failure('M4_FEE_EXECUTION_REVIEW_REQUIRED');
 if(typeof transport?.rpc!=='function'||typeof transport.publicRequest!=='function'||typeof publishMetadata!=='function')throw failure('PREPARATION_CONFIGURATION_REQUIRED');
 const pending=new Map(),busy=new Set();
 return async function prepare(identity,initialBuy,requestId){
  if(typeof initialBuy!=='string'||initialBuy.length>30)throw Object.assign(failure('PREPARATION_INITIAL_BUY_INVALID'),{status:400});
  const amount=parseInitialBuy(initialBuy),fingerprint=preparationFingerprint(identity,amount),key=identity.owner+':'+requestId;
  if(executionReview&&amount!==0)throw Object.assign(failure('EXECUTION_ZERO_BUY_REQUIRED'),{status:409});
  const stored=await readPreparation?.(identity,amount,requestId);if(stored){if(executionReview)assertExecutionReview(stored,identity,{now:now()});return stored;}
  const prior=pending.get(key);if(prior){if(prior.fingerprint!==fingerprint)throw Object.assign(failure('PREPARATION_REQUEST_CONFLICT'),{status:409});return prior.task.then(result=>{if(result.expiresAt<=now())throw Object.assign(failure('PREPARATION_EXPIRED'),{status:409});return result;});}
  if(busy.has(identity.agentId))throw Object.assign(failure('PREPARATION_IN_PROGRESS'),{status:409});
  if(pending.size>=100){if(readPreparation)for(const [id,p]of pending)if(p.expiresAt!==null&&p.expiresAt<=now())pending.delete(id);if(pending.size>=100)throw failure('PREPARATION_CAPACITY_REACHED');}
  busy.add(identity.agentId);
  const entry={fingerprint,expiresAt:null,task:null};
  const task=(async()=>{
   const contextRetries=[],rpc=(method,params)=>readAtMinimumContext(transport,method,params,{onRetry:detail=>{contextRetries.push(detail);console.warn('M3 read-only context retry',JSON.stringify(detail));}});
   const metadataUri=await publishMetadata(identity),launch={...identity,metadataUri,initialBuyLamports:amount};
   // A random public identifier is sufficient for unsigned simulation. No mint keypair exists.
   let mint;if(mintFactory){mint=mintFactory();if(!(mint instanceof PublicKey)||!PublicKey.isOnCurve(mint.toBytes())||mint.toBase58()===identity.owner)throw failure('PREPARATION_MINT_INVALID');}else do{mint=new PublicKey(randomBytes(32));}while(!PublicKey.isOnCurve(mint.toBytes())||mint.toBase58()===identity.owner);
   const idl=await (await transport.publicRequest(PREPARATION_IDL)).json(),definition=idl.instructions?.find(i=>i.name==='create_v2'),accounts=creationAccounts(mint,identity.owner);
   if(idl.address!==PUMP||JSON.stringify(definition?.discriminator)!=='[214,144,76,236,95,139,49,180]'||JSON.stringify(definition?.args?.map(a=>[a.name,a.type]))!==JSON.stringify(expectedArgs))throw failure('PREPARATION_IDL_SCHEMA_MISMATCH');
   for(const [name,type]of [['OptionBool','bool'],['OptionU64','u64']])if(JSON.stringify(idl.types?.find(t=>t.name===name)?.type)!==JSON.stringify({kind:'struct',fields:[type]}))throw failure('PREPARATION_IDL_TUPLE_MISMATCH');
   checkAccounts(definition,accounts);
   const genesis=await rpc('getGenesisHash',[]);if(genesis!==GENESIS)throw failure('PREPARATION_WRONG_MAINNET');
   const state=await transport.rpc('getMultipleAccounts',[accounts.map(a=>a.pubkey.toBase58()),{encoding:'base64',commitment:'finalized'}]);
   if(!Array.isArray(state?.value)||state.value.length!==16||state.value[0])throw failure('PREPARATION_ACCOUNT_STATE_INVALID');
   for(const i of [6,7,8,9,15])if(!state.value[i]?.executable)throw failure('PREPARATION_PROGRAM_NOT_EXECUTABLE');
   if(state.value[4]?.owner!==PUMP||state.value[5]?.owner!=='11111111111111111111111111111111')throw failure('PREPARATION_OWNER_ACCOUNT_MISMATCH');
   if(amount){
    const definition=idl.instructions.find(i=>i.name==='buy_exact_sol_in'),keys=initialBuyAccounts(mint,identity.owner);
    if(JSON.stringify(definition?.discriminator)!=='[56,252,116,8,158,223,205,95]'||JSON.stringify(definition?.args.map(a=>[a.name,a.type]))!==JSON.stringify([['spendable_sol_in','u64'],['min_tokens_out','u64'],['track_volume',{defined:{name:'OptionBool'}}]]))throw failure('PREPARATION_BUY_IDL_MISMATCH');
    checkAccounts(definition,keys);
    const data=Buffer.from(state.value[4].data[0],'base64');let offset=8;const values={};
    for(const f of idl.types.find(t=>t.name==='Global').type.fields){const read=t=>{if(t==='pubkey'){const v=new PublicKey(data.subarray(offset,offset+32)).toBase58();offset+=32;return v;}if(t==='u64'){const v=data.readBigUInt64LE(offset);offset+=8;return v;}if(t==='bool')return data[offset++];throw failure('PREPARATION_GLOBAL_SCHEMA_MISMATCH');};values[f.name]=f.type?.array?Array.from({length:f.type.array[1]},()=>read(f.type.array[0])):read(f.type);}
    if(![values.fee_recipient,...values.fee_recipients].includes(FEE_RECIPIENT)||!values.buyback_fee_recipients.includes(BUYBACK_RECIPIENT))throw failure('PREPARATION_FEE_RECIPIENT_MISMATCH');
    for(const a of keys)if(!accounts.some(e=>e.pubkey.equals(a.pubkey)))accounts.push(a);
    const feeProgram=await transport.rpc('getMultipleAccounts',[[keys[15].pubkey.toBase58()],{encoding:'base64',commitment:'finalized'}]);if(!feeProgram.value[0]?.executable)throw failure('PREPARATION_FEE_PROGRAM_NOT_EXECUTABLE');
   }
   const startedAt=now(),stateSlot=executionReview?contextSlot(state):null;
   const feePolicy=explicitM4Fees?selectFeePolicy(await rpc('getRecentPrioritizationFees',[accounts.filter(a=>a.isWritable).map(a=>a.pubkey.toBase58())]),stateSlot):null;
   const latestResponse=await rpc('getLatestBlockhash',[{commitment:'finalized',...(executionReview?{minContextSlot:stateSlot}:{})}]),latest=latestResponse.value;
   if(executionReview)contextSlot(latestResponse,stateSlot);
   const tx=buildCreation(mint,latest.blockhash,launch,feePolicy),bytes=tx.serialize({requireAllSignatures:false,verifySignatures:false}),context={mint,blockhash:latest.blockhash,genesis,chainId:'solana:101',launch,feePolicy},structure=inspectCreation(bytes,context);
   if(feePolicy)accounts.push({pubkey:new PublicKey(structure.accounts.at(-1).address)});
   const feeResponse=await rpc('getFeeForMessage',[tx.serializeMessage().toString('base64'),{commitment:'finalized',...(executionReview?{minContextSlot:contextSlot(latestResponse)}:{})}]),fee=feeResponse.value;
   if(!Number.isSafeInteger(fee)||fee<0)throw failure('PREPARATION_FEE_UNAVAILABLE');
   const components=feeComponents(structure,fee);
   const addresses=accounts.map(a=>a.pubkey.toBase58()),before=await rpc('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'finalized',...(executionReview?{minContextSlot:contextSlot(feeResponse,contextSlot(latestResponse))}:{})}]);
   if(executionReview)contextSlot(before,contextSlot(feeResponse));
   const simulation=await rpc('simulateTransaction',[bytes.toString('base64'),{encoding:'base64',sigVerify:false,replaceRecentBlockhash:false,commitment:'finalized',minContextSlot:before.context.slot,innerInstructions:true,accounts:{encoding:'base64',addresses}}]);
   if(executionReview)contextSlot(simulation,contextSlot(before));
   const afterRead=await rpc('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'finalized',minContextSlot:simulation.context.slot}]);
   const policy=evaluateSimulation(bytes,context,{before,afterRead,simulation,fee});
   const estimatedDebit=policy.allowed&&Number.isSafeInteger(policy.estimatedPayerDebitLamports)&&policy.estimatedPayerDebitLamports>=0?policy.estimatedPayerDebitLamports:null;
   const rent=[],warnings=[...policy.warnings];
   for(const a of policy.accountEffects.filter(a=>a.created)){
    const dataLength=Buffer.from(a.post.data[0],'base64').length;let minimumRentExemptionLamports=null;
    try{const value=await transport.rpc('getMinimumBalanceForRentExemption',[dataLength,{commitment:'finalized'}]);if(!Number.isSafeInteger(value)||value<0)throw failure('PREPARATION_RENT_UNAVAILABLE');minimumRentExemptionLamports=value;}catch{warnings.push('MINIMUM_RENT_UNAVAILABLE');}
    rent.push({name:a.name,address:a.address,dataLength,fundedLamports:a.post.lamports,minimumRentExemptionLamports});
   }
   const rentSum=simulation.value.err===null&&rent.length>0&&rent.every(a=>a.minimumRentExemptionLamports!==null)?rent.reduce((n,a)=>n+a.minimumRentExemptionLamports,0):null;
   const minimumRent=Number.isSafeInteger(rentSum)&&rentSum>=0?rentSum:null;
   const accountEffects=policy.accountEffects.map(a=>({name:a.name,address:a.address,writable:a.writable,created:a.created,preLamports:a.pre?.lamports??null,postLamports:a.post?.lamports??null,deltaLamports:a.deltaLamports}));
   // Requested positive buy input is not necessarily its exact observed debit.
   // The zero-buy M3 path permits an exact non-network remainder without that assumption.
   const otherDebit=estimatedDebit===null||amount!==0?null:estimatedDebit-fee;
   const logs=(simulation.value.logs??[]).filter(l=>typeof l==='string');
   if(contextRetries.length)warnings.push('RPC_MIN_CONTEXT_SLOT_RETRIED');
   const result={mode:'M3_UNSIGNED_PREPARATION',id:requestId,createdAt:new Date(now()).toISOString(),expiresAt:now()+30000,network:'solana:101',genesis,programId:PUMP,rpcProvider:transport.provider,launch,metadataUri,metadataStatus:'PUBLIC_VERIFIED',mint:mint.toBase58(),...(feePolicy?{feePolicy}:{}),recentBlockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight,transactionBase64:bytes.toString('base64'),transactionSha256:hash(bytes),transactionSize:bytes.length,instructionCount:tx.instructions.length,transactionType:'LEGACY',feePayer:identity.owner,mintStrategy:'UNSIGNED_PUBLIC_IDENTIFIER_NO_PRIVATE_KEY',computeBudgetInstructionCount:tx.instructions.filter(i=>i.programId.toBase58()==='ComputeBudget111111111111111111111111111111').length,structure,simulation:{status:simulation.value.err===null?'PASS':'FAIL',error:simulation.value.err,slot:simulation.context.slot,preReadSlot:before.context.slot,postReadSlot:afterRead.context.slot,unitsConsumed:simulation.value.unitsConsumed??null,logCount:logs.length,logsTruncated:logs.length>100||logs.some(l=>l.length>512),logs:logs.slice(0,100).map(l=>l.slice(0,512))},policy:{allowed:policy.allowed,reasons:policy.reasons,warnings:[...new Set(warnings)],estimatedPayerDebitLamports:estimatedDebit,...components,validatedOverheadLamports:policy.validatedOverheadLamports,otherRequiredDebitLamports:Number.isSafeInteger(otherDebit)&&otherDebit>=0?otherDebit:null,createdAccountFundingLamports:policy.createdAccountFundingLamports,minimumRentExemptionLamports:minimumRent,rentAccounts:rent,accountEffects,payerPreBalanceLamports:policy.payerPreBalance,payerPostBalanceLamports:policy.payerPostBalance,invokedPrograms:policy.invokedPrograms,initialBuyLamports:amount,reviewDebitCeilingLamports:Number(policy.thresholdLamports),prestateSameBank:policy.prestateSameBank,absoluteMaximumWalletDebitLamports:null,uncertainty:policy.uncertainty},signingEnabled:false,broadcastEnabled:false,absoluteDebitBoundVerified:false};
   const validity=executionReview?await rpc('isBlockhashValid',[latest.blockhash,{commitment:'finalized',minContextSlot:contextSlot(afterRead,contextSlot(simulation))}]):null;
   // Persist public-chain facts before a review guard can throw. Failed write
   // fails preparation. Diagnostic evidence grants no financial authorization.
   if(captureDiagnostics)await captureDiagnostics(result,{before,afterRead,simulation,feeResponse,latestResponse,validity});
   if(executionReview){result.executionReview=createExecutionReview(result,{before,afterRead,simulation,feeResponse,latestResponse,validity,startedAt,now:now()});result.expiresAt=result.executionReview.expiresAt;assertExecutionReview(result,identity,{now:now()});}
   if(captureProof)await captureProof(result,{before,afterRead,simulation,feeResponse,latestResponse});
   return result;
  })().then(result=>{entry.expiresAt=result.expiresAt;return result;}).catch(error=>{pending.delete(key);throw error;}).finally(()=>busy.delete(identity.agentId));entry.task=task;pending.set(key,entry);return task;
 };
}
