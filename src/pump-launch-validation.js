import {Buffer} from 'buffer';
import {Transaction,PublicKey} from '@solana/web3.js';
import {inspectCreation,GENESIS,URI,PAYER} from './pump-readiness.js';
import {evaluateSimulation} from './pump-simulation-policy.js';

/** Agent-bound approved launch; signing cannot alter even a compute-budget byte. */
export function validateLaunchEvidence(e){
 if(e.chainId!=='solana:101'||e.genesis!==GENESIS||e.metadataUri!==(e.launch?.metadataUri??URI))throw Error('Launch network or metadata mismatch');
 const bytes=Buffer.from(e.transactionBase64,'base64');
 const context={mint:new PublicKey(e.mint),blockhash:e.recentBlockhash,genesis:e.genesis,chainId:e.chainId,launch:e.launch};
 inspectCreation(bytes,context);
 const policy=evaluateSimulation(bytes,context,{before:e.before,afterRead:e.afterRead,simulation:e.simulation,fee:e.feeQuote.value});
 if(!policy.allowed)throw Error('Spending policy rejected: '+policy.reasons.join(', '));
 return policy;
}
export function verifyLaunchTransaction(serialized,e,requirePayer=true){
 validateLaunchEvidence(e);
 const bytes=Buffer.from(serialized,'base64'),tx=Transaction.from(bytes);
 if(!tx.serialize({requireAllSignatures:false,verifySignatures:false}).equals(bytes))throw Error('Non-canonical signed transaction bytes');
 const expected=Transaction.from(Buffer.from(e.transactionBase64,'base64'));
 if(!tx.serializeMessage().equals(expected.serializeMessage()))throw Error('Wallet changed transaction message. Nothing broadcast.');
 if(tx.feePayer.toBase58()!==(e.launch?.owner??PAYER)||!tx.signatures.find(s=>s.publicKey.toBase58()===e.mint)?.signature)throw Error('Missing mint signature');
 if(!tx.verifySignatures(requirePayer))throw Error('Invalid or missing transaction signatures');
 return tx;
}
