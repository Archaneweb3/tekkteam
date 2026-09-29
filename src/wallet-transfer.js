import {Transaction, SystemProgram, PublicKey, ComputeBudgetProgram} from '@solana/web3.js';
export function buildTransfer(source,destination,lamports,blockhash,budget){
 const tx=new Transaction({feePayer:new PublicKey(source),recentBlockhash:blockhash});
 if(budget){
  if(!Number.isSafeInteger(budget.computeUnitLimit)||budget.computeUnitLimit<=0||!Number.isSafeInteger(budget.computeUnitPrice)||budget.computeUnitPrice<0)throw Error('Invalid compute budget');
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports:budget.computeUnitPrice}),ComputeBudgetProgram.setComputeUnitLimit({units:budget.computeUnitLimit}));
 }
 return tx.add(SystemProgram.transfer({fromPubkey:new PublicKey(source),toPubkey:new PublicKey(destination),lamports}));
}
// Reconstruct the complete message, including signer/account flags and instruction order.
export function inspectTransfer(tx, source, destination, lamports, budget) {
 if(!Number.isSafeInteger(lamports)||lamports<=0||source===destination)throw Error('Transfer amount/destination mismatch');
 const expected=buildTransfer(source,destination,lamports,tx.recentBlockhash,budget);
 if(tx.nonceInfo||!tx.serializeMessage().equals(expected.serializeMessage()))throw Error('Transfer message mismatch');
 return tx;
}
export function inspectFundingReview(r,owner,wallet,agentId) {
 if(r.kind!=='FUND'||r.status!=='PREPARED'||r.agentId!==agentId||r.ownerWallet!==owner||r.agentWallet!==wallet||r.source!==owner||r.destination!==wallet||r.network!=='solana:mainnet'||r.expiresAt<=Date.now())throw Error('Funding review no longer matches this agent');
 const tx=Transaction.from(Buffer.from(r.transaction,'base64'));inspectTransfer(tx,owner,wallet,r.amountLamports,r.fundingMessageVersion===1?r:undefined);
 if(tx.recentBlockhash!==r.blockhash||tx.serializeMessage().toString('base64')!==r.message)throw Error('Funding message changed');
 return tx;
}
