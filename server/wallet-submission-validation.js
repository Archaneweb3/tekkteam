import {Transaction} from '@solana/web3.js';
import {createHash} from 'node:crypto';
import {inspectTransfer} from '../src/wallet-transfer.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Only fixed classifications and message digests may leave this boundary.
export function validateWalletSubmission(encoded,r,{requestId=r.id,requireSignature=true}={}){
 const diagnostic={code:'DECODE_FAILURE'};
 const reject=code=>{diagnostic.code=code;throw Object.assign(Error('Wallet submission rejected before broadcast'),{diagnostic:{...diagnostic}});};
 const decode=value=>{
  if(typeof value!=='string'||!value.length||value.length>4000||value.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error();
  const bytes=Buffer.from(value,'base64');if(bytes.toString('base64')!==value)throw Error();return Transaction.from(bytes);
 };
 let expected,tx;
 try{expected=decode(r.transaction);inspectTransfer(expected,r.source,r.destination,r.amountLamports,r.fundingMessageVersion===1?r:undefined);
  if(expected.serializeMessage().toString('base64')!==r.message||expected.recentBlockhash!==r.blockhash||r.network!=='solana:mainnet')throw Error();
 }catch{reject('EXPECTED_REQUEST_INVALID');}
 diagnostic.expectedMessageHash=hash(expected.serializeMessage());
 if(r.messageHash&&r.messageHash!==diagnostic.expectedMessageHash)reject('EXPECTED_REQUEST_INVALID');
 if(requestId!==r.id)reject('REQUEST_ASSOCIATION_MISMATCH');
 try{tx=decode(encoded);}catch{reject('DECODE_FAILURE');}
 let message;
 try{message=tx.serializeMessage();}catch{reject('DECODE_FAILURE');}
 diagnostic.returnedMessageHash=hash(message);
 if(tx.recentBlockhash!==r.blockhash)reject('BLOCKHASH_MISMATCH');
 if(!message.equals(expected.serializeMessage()))reject('MESSAGE_MISMATCH');
 try{inspectTransfer(tx,r.source,r.destination,r.amountLamports,r.fundingMessageVersion===1?r:undefined);}catch{reject('MESSAGE_MISMATCH');}
 if(requireSignature){try{if(!tx.verifySignatures())throw Error();}catch{reject('SIGNATURE_VERIFICATION_FAILURE');}}
 return tx;
}
