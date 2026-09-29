import {ComputeBudgetProgram,PublicKey,TransactionInstruction,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {createHash} from 'node:crypto';
import {resolveMainnetTables,decodeMainnetTransaction,inspectMainnetTokenAccounts,assertMainnet} from './mainnet-accounts.js';
import {JUPITER_BUILD_URL} from './quote.js';
import {reject} from './intent.js';
import {applyDiscoveryControls} from './discovery-controls.js';

const cleanInstruction=ix=>{
 if(!ix||!Array.isArray(ix.accounts)||ix.accounts.length>100||typeof ix.data!=='string'||ix.data.length>4000)reject('BUILD_INSTRUCTION_INVALID');
 const data=Buffer.from(ix.data,'base64');if(data.toString('base64')!==ix.data)reject('BUILD_DATA_INVALID');
 return {programId:new PublicKey(ix.programId).toBase58(),accounts:ix.accounts.map(a=>{if(typeof a.isSigner!=='boolean'||typeof a.isWritable!=='boolean')reject('BUILD_ACCOUNT_FLAGS_INVALID');return {pubkey:new PublicKey(a.pubkey).toBase58(),isSigner:a.isSigner,isWritable:a.isWritable};}),data:ix.data};
};
const toIx=ix=>new TransactionInstruction({programId:new PublicKey(ix.programId),keys:ix.accounts.map(a=>({...a,pubkey:new PublicKey(a.pubkey)})),data:Buffer.from(ix.data,'base64')});
export async function fetchProductionBuild(intent,{apiKey,fetchImpl=fetch,routeControls={}}={}){
 if(!apiKey)reject('JUPITER_CONFIGURATION_UNAVAILABLE');
 const params=new URLSearchParams({inputMint:intent.inputMint,outputMint:intent.outputMint,amount:intent.inputAmount,taker:intent.agentWallet,slippageBps:String(intent.slippageBps)});
 applyDiscoveryControls(params,routeControls);
 let body;try{const response=await fetchImpl(JUPITER_BUILD_URL+'?'+params,{headers:{'x-api-key':apiKey},redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)reject('JUPITER_BUILD_UNAVAILABLE');const reader=response.body.getReader(),chunks=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>524288){await reader.cancel();reject('BUILD_TOO_LARGE');}chunks.push(Buffer.from(value));}body=JSON.parse(Buffer.concat(chunks).toString());}catch{reject('JUPITER_BUILD_UNAVAILABLE');}
 if(body.inputMint!==intent.inputMint||body.outputMint!==intent.outputMint||body.inAmount!==intent.inputAmount||body.swapMode!=='ExactIn'||body.slippageBps!==intent.slippageBps)reject('BUILD_INTENT_MISMATCH');
 const result={};for(const k of ['inputMint','outputMint','inAmount','outAmount','otherAmountThreshold','swapMode','slippageBps','priceImpactPct'])result[k]=body[k];
 if(!Array.isArray(body.routePlan)||body.routePlan.length>20)reject('BUILD_ROUTE_INVALID');
 result.routePlan=body.routePlan.map(r=>({percent:r.percent,bps:r.bps,swapInfo:Object.fromEntries(['ammKey','label','inputMint','outputMint','inAmount','outAmount'].map(k=>[k,r.swapInfo?.[k]]))}));
 for(const k of ['computeBudgetInstructions','setupInstructions','otherInstructions']){if(!Array.isArray(body[k])||body[k].length>32)reject('BUILD_SHAPE_INVALID');result[k]=body[k].map(cleanInstruction);}
 result.swapInstruction=cleanInstruction(body.swapInstruction);result.cleanupInstruction=body.cleanupInstruction?cleanInstruction(body.cleanupInstruction):null;result.tipInstruction=body.tipInstruction?cleanInstruction(body.tipInstruction):null;
 result.lookupTableAddresses=Object.keys(body.addressesByLookupTableAddress??{}).map(a=>new PublicKey(a).toBase58());
 // Provider-supplied ALT contents and response metadata never become chain proofs.
 return result;
}
export async function inspectProductionBuild(connection,intent,build){
 await assertMainnet(connection);const slot=await connection.getSlot('confirmed');
 const syntheticLookupMessage={version:0,addressTableLookups:build.lookupTableAddresses.map(a=>({accountKey:new PublicKey(a),writableIndexes:[],readonlyIndexes:[]}))};
 const {lookupTables,proofs}=await resolveMainnetTables(connection,syntheticLookupMessage,{minContextSlot:slot});
 const {blockhash,lastValidBlockHeight}=await connection.getLatestBlockhash('confirmed');
 const ordered=[ComputeBudgetProgram.setComputeUnitLimit({units:1400000}),...build.computeBudgetInstructions.map(toIx),...build.setupInstructions.map(toIx),toIx(build.swapInstruction),...(build.cleanupInstruction?[toIx(build.cleanupInstruction)]:[]),...build.otherInstructions.map(toIx),...(build.tipInstruction?[toIx(build.tipInstruction)]:[])];
 const message=new TransactionMessage({payerKey:new PublicKey(intent.agentWallet),recentBlockhash:blockhash,instructions:ordered});
 const versions=[];
 for(const version of ['legacy','v0']){
  try{const tx=new VersionedTransaction(version==='legacy'?message.compileToLegacyMessage():message.compileToV0Message(lookupTables));const bytes=tx.serialize();if(bytes.length>1232)throw Error();const encoded=Buffer.from(bytes).toString('base64'),d=await decodeMainnetTransaction(connection,encoded,{minContextSlot:slot});versions.push({version,unsignedTransaction:encoded,messageHash:d.messageHash,accounts:d.accounts,lookupProofs:d.proofs,status:'REJECTED',reason:'UNAUDITED_JUPITER_CPI_ROUTE'});}catch{versions.push({version,status:'REJECTED',reason:'SIZE_OR_RPC_LOOKUP_VALIDATION_FAILED'});}
 }
 let tokenAccounts;try{tokenAccounts=await inspectMainnetTokenAccounts(connection,intent,{minContextSlot:slot});}catch(e){tokenAccounts={status:'REJECTED',reason:e.code??'ACCOUNT_INSPECTION_UNAVAILABLE'};}
 return {schema:1,observedAt:new Date().toISOString(),network:'solana:mainnet',hypotheticalOnly:true,notSigned:true,notBroadcast:true,intent,build,buildHash:createHash('sha256').update(JSON.stringify(build)).digest('hex'),slot,blockhash,lastValidBlockHeight,lookupProofs:proofs,tokenAccounts,versions,productionSupported:false};
}
