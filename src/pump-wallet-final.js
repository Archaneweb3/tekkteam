// Shared, SDK-injected validator. Only the captured owner-only assertion variant.
// No signer, network capability, program-wide exception or transaction reconstruction.
export const LIGHTHOUSE_PROGRAM='L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95';
export const FINAL_MESSAGE_POLICY='PHANTOM_LIGHTHOUSE_OWNER_V1';
const fail=code=>{throw Object.assign(Error(code),{code,status:409});};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const meta=k=>({address:k.pubkey.toBase58(),signer:k.isSigner,writable:k.isWritable});
const instruction=ix=>({program:ix.programId.toBase58(),accounts:ix.keys.map(meta),data:Array.from(ix.data)});
export function validateFinalWalletMessage(preparedBase64,finalBase64,result,{Transaction,Buffer},requireAllSignatures=false){
 const bytes=Buffer.from(finalBase64,'base64'),prepared=Transaction.from(Buffer.from(preparedBase64,'base64')),tx=Transaction.from(bytes);
 if(bytes.length>1232||bytes.toString('base64')!==finalBase64||!tx.serialize({requireAllSignatures:false,verifySignatures:false}).equals(bytes))fail('M4_FINAL_SERIALIZATION_INVALID');
 const owner=result.launch.owner,mint=result.mint;
 if(prepared.feePayer?.toBase58()!==owner||tx.feePayer?.toBase58()!==owner||tx.recentBlockhash!==prepared.recentBlockhash||tx.recentBlockhash!==result.recentBlockhash||tx.signatures.length!==2||!same(tx.signatures.map(s=>s.publicKey.toBase58()),[owner,mint])||!same(prepared.signatures.map(s=>s.publicKey.toBase58()),[owner,mint]))fail('M4_FINAL_SIGNERS_OR_BLOCKHASH_CHANGED');
 if(!tx.signature||!tx.verifySignatures(requireAllSignatures)||(!requireAllSignatures&&tx.signatures[1].signature!==null))fail('M4_FINAL_OWNER_SIGNATURE_INVALID');
 const original=prepared.instructions,final=tx.instructions;
 if(final.length!==original.length&&final.length!==original.length+1||!same(original.map(instruction),final.slice(0,original.length).map(instruction)))fail('M4_FINAL_INTENT_CHANGED');
 let assertion=null;
 if(final.length===original.length+1){
  const ix=final.at(-1),data=Buffer.from(ix.data);
  if(ix.programId.toBase58()!==LIGHTHOUSE_PROGRAM||!same(ix.keys.map(meta),[{address:owner,signer:true,writable:true}])||data.length!==26||!data.subarray(0,4).equals(Buffer.from([6,4,3,0]))||!data.subarray(12).equals(Buffer.from([4,3,0,0,1,0,0,0,0,0,0,0,0,0])))fail('M4_LIGHTHOUSE_ASSERTION_DENIED');
  const floor=data.readBigUInt64LE(4),review=result.executionReview;
  if(!Number.isSafeInteger(review?.minimumReserveLamports)||!Number.isSafeInteger(review?.expectedRemainingBalanceLamports)||floor<BigInt(review.minimumReserveLamports)||floor>BigInt(review.expectedRemainingBalanceLamports))fail('M4_LIGHTHOUSE_BALANCE_FLOOR_INVALID');
  assertion={program:LIGHTHOUSE_PROGRAM,kind:'AssertAccountInfoMulti',owner,minBalanceLamports:Number(floor),accountOwner:'11111111111111111111111111111111',dataLength:0};
 }
 const before=prepared.compileMessage(),after=tx.compileMessage(),keys=after.accountKeys.map(k=>k.toBase58());
 if(new Set(keys).size!==keys.length||keys.length!==before.accountKeys.length+(assertion?1:0))fail('M4_FINAL_ACCOUNT_SET_CHANGED');
 for(let i=0;i<before.accountKeys.length;i++){
  const address=before.accountKeys[i].toBase58(),index=keys.indexOf(address);
  if(index<0||after.isAccountSigner(index)!==before.isAccountSigner(i)||after.isAccountWritable(index)!==before.isAccountWritable(i))fail('M4_FINAL_ACCOUNT_PRIVILEGES_CHANGED');
 }
 if(assertion){const i=keys.indexOf(LIGHTHOUSE_PROGRAM);if(i<0||after.isAccountSigner(i)||after.isAccountWritable(i)||before.accountKeys.some(k=>k.toBase58()===LIGHTHOUSE_PROGRAM))fail('M4_FINAL_LIGHTHOUSE_PRIVILEGES_INVALID');}
 else if(!tx.serializeMessage().equals(prepared.serializeMessage()))fail('M4_FINAL_UNEXPLAINED_MESSAGE_CHANGE');
 return {tx,assertion,allowedDiff:assertion?'PHANTOM_LIGHTHOUSE_ADDED':'SIGNATURES_ONLY',preparedMessage:prepared.serializeMessage(),finalMessage:tx.serializeMessage(),accounts:keys.map((address,i)=>({address,signer:after.isAccountSigner(i),writable:after.isAccountWritable(i)}))};
}
