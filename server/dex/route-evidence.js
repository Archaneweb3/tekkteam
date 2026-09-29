import {createHash} from 'node:crypto';
import {AddressLookupTableAccount,PublicKey,SystemProgram,ComputeBudgetProgram} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {decodeDexTransaction} from './transaction-validator.js';

// Offline observation only: historical RPC snapshots are not fresh authorization.
// In particular, a provider label never establishes a pool or CPI account role.
export function observeRouteEvidence(sample,variant,snapshots){
 const tables=(sample.versions.find(v=>v.version===variant)?.unsignedTransaction);
 if(!tables)throw new Error('UNAVAILABLE_CAPTURED_VARIANT');
 const lookupTables=snapshots.map(s=>{
  if(s.owner!=='AddressLookupTab1e1111111111111111111111111'||s.executable)throw new Error('INVALID_ALT_SNAPSHOT');
  return new AddressLookupTableAccount({key:new PublicKey(s.address),state:AddressLookupTableAccount.deserialize(Buffer.from(s.data,'base64'))});
 });
 const d=decodeDexTransaction(tables,{lookupTables});
 const captured=sample.versions.find(v=>v.version===variant);
 if(d.messageHash!==captured.messageHash)throw new Error('CAPTURED_MESSAGE_HASH_MISMATCH');
 if(JSON.stringify(d.accounts)!==JSON.stringify(captured.accounts))throw new Error('CAPTURED_RESOLUTION_MISMATCH');
 const m=d.transaction.message,staticCount=m.staticAccountKeys.length;
 const owner=new PublicKey(sample.intent.agentWallet);
 const atas=[sample.intent.inputMint,sample.intent.outputMint].map(mint=>({mint,address:getAssociatedTokenAddressSync(new PublicKey(mint),owner).toBase58()}));
 const accounts=d.accounts.map((a,index)=>({...a,index,origin:index<staticCount?'static':'ALT',role:a.address===owner.toBase58()?'INTENDED_AGENT':atas.some(x=>x.address===a.address)?'DERIVED_AGENT_ATA':'UNPROVEN'}));
 const instructions=d.instructions.map((ix,index)=>{
  const program=ix.programId.toBase58(),data=Buffer.from(ix.data);
  const evidence={index,program,accountIndices:ix.keys.map(k=>accounts.findIndex(a=>a.address===k.pubkey.toBase58())),dataHex:data.toString('hex'),semantic:'UNDECODED',flow:null};
  if(program===ComputeBudgetProgram.programId.toBase58()&&ix.keys.length===0){
   if(data.length===5&&data[0]===2){evidence.semantic='SET_COMPUTE_UNIT_LIMIT';evidence.units=data.readUInt32LE(1);}
   if(data.length===9&&data[0]===3){evidence.semantic='SET_COMPUTE_UNIT_PRICE';evidence.microLamports=data.readBigUInt64LE(1).toString();}
  }
  if(program===SystemProgram.programId.toBase58()&&data.length===12&&data.readUInt32LE(0)===2&&ix.keys.length===2){evidence.semantic='SYSTEM_TRANSFER';evidence.flow={source:ix.keys[0].pubkey.toBase58(),destination:ix.keys[1].pubkey.toBase58(),lamports:data.readBigUInt64LE(4).toString()};}
  if(program===TOKEN_PROGRAM_ID.toBase58()&&data.length===1&&data[0]===17)evidence.semantic='SYNC_NATIVE';
  if(program===TOKEN_PROGRAM_ID.toBase58()&&data.length===1&&data[0]===9){evidence.semantic='CLOSE_ACCOUNT';evidence.flow={source:ix.keys[0]?.pubkey.toBase58(),destination:ix.keys[1]?.pubkey.toBase58(),authority:ix.keys[2]?.pubkey.toBase58(),lamports:'UNPROVEN_AT_EXECUTION'};}
  if(program===ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()&&data.length===1&&data[0]===1)evidence.semantic='CREATE_IDEMPOTENT_ATA_UNVALIDATED';
  return evidence;
 });
 const lookups=(m.addressTableLookups??[]).map(l=>({address:l.accountKey.toBase58(),writableIndexes:Array.from(l.writableIndexes),readonlyIndexes:Array.from(l.readonlyIndexes),snapshotSlot:snapshots.find(s=>s.address===l.accountKey.toBase58())?.slot}));
 return {observationOnly:true,approved:false,executionAllowed:false,reason:'CPI_VALUE_FLOW_NOT_PROVEN',version:d.version,messageHash:d.messageHash,feePayer:d.feePayer,header:m.header,signatureCount:d.transaction.signatures.length,allSignaturesZero:d.transaction.signatures.every(s=>s.every(b=>b===0)),blockhash:d.blockhash,accounts,lookups,instructions,derivedAtas:atas,unknownWritableAccounts:accounts.filter(a=>a.writable&&a.role==='UNPROVEN').map(a=>a.address),instructionGraphHash:createHash('sha256').update(JSON.stringify(instructions)).digest('hex'),provenRouteInput:null,provenRouteMinimumOutput:null,provenCpiPrograms:null};
}
