import {PublicKey} from '@solana/web3.js';
import {getAssociatedTokenAddressSync} from '@solana/spl-token';
import {GENESIS} from '../src/pump-readiness.js';
import {pumpSdk} from '../server/dex/pump-sdk-boundary.js';
import {decodePumpVenueBundle} from '../server/dex/pump-account-decoder.js';
import {buildFirstBuyCandidate,inspectFirstBuyCosts} from '../server/dex/pump-first-buy.js';

// Narrow read-only transport. No simulation, transaction-history scan, signer,
// sendTransaction, funding, or environment discovery is available in this tool.
const allowed=new Set(['getGenesisHash','getMultipleAccounts','getLatestBlockhash','getMinimumBalanceForRentExemption','getFeeForMessage']);
export function firstBuyReadOnlyRpc(endpoint,{request=fetch}={}){
 if(new URL(endpoint).protocol!=='https:')throw Error('FIRST_BUY_RPC_HTTPS_REQUIRED');let id=0;
 return async(method,params)=>{
  if(!allowed.has(method))throw Error('FIRST_BUY_RPC_METHOD_DENIED');const frozen=structuredClone(params);
  for(let attempt=0;attempt<3;attempt++){
   const current=++id;let status=null,rpcCode=null;
   try{const r=await request(endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:current,method,params:frozen}),signal:AbortSignal.timeout(15000)});status=r.status;
    if(!r.ok)throw Error();const d=await r.json();rpcCode=Number.isSafeInteger(d.error?.code)?d.error.code:null;
    if(d.id===current&&rpcCode===-32016&&attempt<2){await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));continue;}
    if(d.id!==current||d.error||!Object.hasOwn(d,'result'))throw Error();return d.result;
   }catch{throw Object.assign(Error('FIRST_BUY_RPC_READ_FAILED'),{method,httpStatus:status,rpcCode});}
  }
 };
}
const validAmount=n=>{if(!Number.isSafeInteger(n)||n<0)throw Error('FIRST_BUY_RPC_AMOUNT_INVALID');return String(n);};
export async function inspectFirstBuyReadOnly({rpc,binding,receipt,now=Date.now}){
 binding=structuredClone(binding);receipt=structuredClone(receipt);
 if(binding?.executionAllowed!==false||binding.network!=='solana:101'||binding.pending?.length!==0||receipt?.agentId!==binding.agentId||receipt.owner!==binding.owner||receipt.mint!==binding.mint||receipt.signature!==binding.receiptSignature||receipt.executionId!==binding.receiptExecutionId||receipt.confirmed!==true||receipt.status!=='Success'||receipt.pumpProvenance!=='FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR')throw Error('FIRST_BUY_CANONICAL_BINDING_REQUIRED');
 if(await rpc('getGenesisHash',[])!==GENESIS)throw Error('FIRST_BUY_GENESIS_MISMATCH');
 const mint=new PublicKey(binding.mint),wallet=new PublicKey(binding.agentWallet),curve=pumpSdk.bondingCurvePda(mint),creatorVault=pumpSdk.creatorVaultPda(new PublicKey(binding.owner)),volume=pumpSdk.userVolumeAccumulatorPda(wallet);
 async function read(roles,minContextSlot){
  const result=await rpc('getMultipleAccounts',[Object.values(roles),{encoding:'base64',commitment:'finalized',...(minContextSlot===undefined?{}:{minContextSlot})}]);
  if(!Number.isSafeInteger(result?.context?.slot)||result.context.slot<0||minContextSlot!==undefined&&result.context.slot<minContextSlot||!Array.isArray(result.value)||result.value.length!==Object.keys(roles).length)throw Error('FIRST_BUY_RPC_ACCOUNT_CONTEXT');
  return {slot:result.context.slot,accounts:Object.fromEntries(Object.entries(roles).map(([role,address],i)=>{
   const a=result.value[i];if(a===null)return [role,{address,slot:result.context.slot,exists:false}];
   if(!a||!Array.isArray(a.data)||a.data[1]!=='base64'||typeof a.data[0]!=='string'||a.data[0].length>21848||Buffer.from(a.data[0],'base64').toString('base64')!==a.data[0]||typeof a.executable!=='boolean')throw Error('FIRST_BUY_RPC_ACCOUNT_ENCODING');validAmount(a.lamports);
   return [role,{address,slot:result.context.slot,exists:true,owner:a.owner,executable:a.executable,lamports:a.lamports,data:Buffer.from(a.data[0],'base64')}];
  }))};
 }
 const initial=await read({mint:mint.toBase58()});if(!initial.accounts.mint.exists)throw Error('FIRST_BUY_MINT_MISSING');
 const tokenProgram=new PublicKey(initial.accounts.mint.owner),base=getAssociatedTokenAddressSync(mint,wallet,false,tokenProgram);
 const roles={mint:mint.toBase58(),curve:curve.toBase58(),global:pumpSdk.GLOBAL_PDA.toBase58(),feeConfig:pumpSdk.PUMP_FEE_CONFIG_PDA.toBase58(),wallet:wallet.toBase58(),base:base.toBase58(),creatorVault:creatorVault.toBase58(),userVolumeAccumulator:volume.toBase58()};
 const snapshot=await read(roles,initial.slot),observedAt=now();
 if(snapshot.accounts.mint.owner!==tokenProgram.toBase58())throw Error('FIRST_BUY_MINT_OWNER_CHANGED');
 const venue=decodePumpVenueBundle({agent:{id:binding.agentId,creator:binding.owner},receipt,context:{network:'solana:101',genesis:GENESIS,source:'BACKEND_RPC_READ',slot:snapshot.slot,currentSlot:snapshot.slot,maxAgeSlots:0,observedAt},accounts:snapshot.accounts});
 const block=await rpc('getLatestBlockhash',[{commitment:'finalized',minContextSlot:snapshot.slot}]);if(!Number.isSafeInteger(block?.context?.slot)||block.context.slot<snapshot.slot||!Number.isSafeInteger(block.value?.lastValidBlockHeight)||block.value.lastValidBlockHeight<=0)throw Error('FIRST_BUY_BLOCKHASH_RESPONSE');
 const candidate=await buildFirstBuyCandidate({venue,executionWallet:binding.agentWallet,accounts:snapshot.accounts,blockhash:block.value.blockhash,now:now(),intent:{agentId:binding.agentId,owner:binding.owner,agentWallet:binding.agentWallet,network:'solana:101',side:'BUY',inputMint:venue.quoteMint,outputMint:venue.mint,inputAmount:'100000',slippageBps:100,expiresAt:observedAt+30000}});
 const rentQuotes={};for(const size of new Set(candidate.rentCandidates.map(r=>r.allocationBytes))){const lamports=await rpc('getMinimumBalanceForRentExemption',[size,{commitment:'finalized'}]);rentQuotes[size]={allocationBytes:size,lamports:validAmount(lamports),commitment:'finalized',observedAt:now()};}
 const fee=await rpc('getFeeForMessage',[candidate.messageBase64,{commitment:'finalized',minContextSlot:block.context.slot}]);if(!Number.isSafeInteger(fee?.context?.slot)||fee.context.slot<block.context.slot||fee.value===null)throw Error('FIRST_BUY_FEE_UNAVAILABLE');
 const feeQuote={messageHash:candidate.messageHash,genesis:GENESIS,source:venue.source,commitment:'finalized',observedAt:now(),lamports:validAmount(fee.value)};
 const costs=inspectFirstBuyCosts({candidate,auxiliary:snapshot.accounts,rentQuotes,feeQuote,protectedReserveLamports:'2020000',sessionCapLamports:'500000',dailyCapLamports:'500000',now:now()});
 return {schema:'TEKKTEAM_FIRST_BUY_READONLY_REPORT_V1',observedAt:new Date(now()).toISOString(),genesis:GENESIS,source:venue.source,canonicalBindingVerified:true,slot:snapshot.slot,blockhashContextSlot:block.context.slot,lastValidBlockHeight:block.value.lastValidBlockHeight,feeContextSlot:fee.context.slot,method:candidate.method,instructionCount:candidate.instructionCount,serializedSize:candidate.serializedSize,messageHash:candidate.messageHash,transactionHash:candidate.transactionHash,accounts:Object.fromEntries(Object.entries(snapshot.accounts).map(([r,a])=>[r,{address:a.address,exists:a.exists,...(a.exists?{owner:a.owner,size:a.data.length,lamports:String(a.lamports)}:{})}])),costs,simulationPerformed:false,reasonSimulationNotPerformed:'READ_ONLY_DIAGNOSTIC_UNQUALIFIED_NO_EXECUTION',transactionSigned:false,broadcast:false};
}
