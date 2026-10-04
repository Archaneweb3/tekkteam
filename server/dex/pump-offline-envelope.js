import {PublicKey,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {createHash} from 'node:crypto';
import {buildOfflinePumpInstruction} from './pump-offline-instruction.js';
import {rejectPump} from './pump-sdk-boundary.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function blockhash(value){try{const key=new PublicKey(value);if(key.equals(PublicKey.default))throw Error();return key.toBase58();}catch{rejectPump('PUMP_BLOCKHASH_INVALID');}}
export async function buildOfflinePumpEnvelope(options){
 const {instruction,quote,...flags}=await buildOfflinePumpInstruction(options);
 const recentBlockhash=blockhash(options.blockhash);
 const message=new TransactionMessage({payerKey:new PublicKey(options.executionWallet),recentBlockhash,instructions:[instruction]}).compileToV0Message();
 const transaction=new VersionedTransaction(message),bytes=transaction.serialize();
 if(bytes.length>1232)rejectPump('PUMP_ENVELOPE_TOO_LARGE');
 return {...flags,quote,unsignedTransaction:Buffer.from(bytes).toString('base64'),messageHash:hash(message.serialize()),blockhash:recentBlockhash,notSigned:true,notBroadcast:true};
}

// Exact reconstructed allowlist. No ALT, additional instructions or signatures.
export async function validateOfflinePumpEnvelope(encoded,options){
 if(typeof encoded!=='string'||encoded.length>2000||Buffer.from(encoded,'base64').toString('base64')!==encoded)rejectPump('PUMP_ENVELOPE_ENCODING_INVALID');
 let transaction;try{transaction=VersionedTransaction.deserialize(Buffer.from(encoded,'base64'));}catch{rejectPump('PUMP_ENVELOPE_INVALID');}
 if(transaction.signatures.length!==1||transaction.signatures.some(s=>s.some(byte=>byte!==0)))rejectPump('PUMP_ENVELOPE_SIGNATURE_FORBIDDEN');
 if(transaction.message.version!==0||transaction.message.addressTableLookups.length||transaction.message.compiledInstructions.length!==1)rejectPump('PUMP_ENVELOPE_SHAPE_INVALID');
 const expected=await buildOfflinePumpEnvelope(options);
 if(encoded!==expected.unsignedTransaction)rejectPump('PUMP_ENVELOPE_CANONICAL_MISMATCH');
 return {messageHash:expected.messageHash,quote:expected.quote,provenance:'DERIVED',abiMatched:true,simulationVerified:false,walletAuthorityVerified:false,executable:false,notSigned:true,notBroadcast:true};
}
