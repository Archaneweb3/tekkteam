import {PublicKey} from '@solana/web3.js';
import {Buffer} from 'buffer';
import {inspectCreation,GENESIS,PUMP,PUMP_COMMIT} from './pump-readiness.js';
// Shared canonical digest input. Review evidence has no signing/send authority.
export function executionReviewBinding(result){
 const structure=inspectCreation(Buffer.from(result.transactionBase64,'base64'),{mint:new PublicKey(result.mint),blockhash:result.recentBlockhash,genesis:result.genesis,chainId:result.network,launch:result.launch,feePolicy:result.feePolicy??null});
 if(result.network!=='solana:101'||result.genesis!==GENESIS||result.programId!==PUMP||result.feePayer!==result.launch.owner||result.signingEnabled!==false||result.broadcastEnabled!==false)throw Error('EXECUTION_REVIEW_IDENTITY_INVALID');
 const {digest,...review}=result.executionReview??{};
 return JSON.stringify({version:1,requestId:result.id,transactionBase64:result.transactionBase64,messageBase64:structure.messageBase64,...(result.feePolicy?{feePolicy:result.feePolicy}:{}),launch:result.launch,mint:result.mint,metadataUri:result.metadataUri,accounts:structure.accounts,network:result.network,genesis:result.genesis,programId:result.programId,route:'create_v2',idlCommit:PUMP_COMMIT,blockhash:result.recentBlockhash,lastValidBlockHeight:result.lastValidBlockHeight,policy:result.policy,simulation:result.simulation,review});
}
