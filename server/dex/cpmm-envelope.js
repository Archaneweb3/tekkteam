// Narrow server-side unsigned envelope. No signer, sender or provider transaction.
import {PublicKey,SystemProgram,ComputeBudgetProgram,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync,unpackAccount,createAssociatedTokenAccountIdempotentInstruction,createSyncNativeInstruction,createCloseAccountInstruction} from '@solana/spl-token';
import {inspectCpmmSnapshot,quoteCpmm,buildCpmmSwap,cpmmProofDecoder,CPMM} from './concrete-cpmm-proof.js';
import {SOL_MINT,integer,reject} from './intent.js';
import nacl from 'tweetnacl';

export const CPMM_ENVELOPE='CPMM_CLASSIC_WSOL_USDC_V1';
const LEGACY_POOL='7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny';
const key=x=>new PublicKey(x),str=x=>x.toBase58();
const ata=(mint,wallet)=>getAssociatedTokenAddressSync(key(mint),key(wallet)).toBase58();
const eq=(a,b,code)=>{if(a!==b)reject(code);};

// Raw accounts must be supplied by the trusted RPC adapter (or isolated tests),
// never request JSON. Decode ownership/mint/authority rather than trusting flags.
export function cpmmEnvelopeContext(p){
 const {intent:i,snapshot,agentAccounts}=p;
 eq(i.network,'solana:mainnet','NETWORK_MISMATCH');
 if(!['BUY','SELL'].includes(i.direction))reject('UNSUPPORTED_EXECUTION_VENUE');
 const buy=i.direction==='BUY';
 const tokenMint=buy?i.outputMint:i.inputMint;
 if(tokenMint===SOL_MINT||i.inputMint!==(buy?SOL_MINT:tokenMint)||i.outputMint!==(buy?tokenMint:SOL_MINT))reject('UNSUPPORTED_EXECUTION_VENUE');
 if(!Number.isInteger(i.slippageBps)||i.slippageBps<0||i.slippageBps>100)reject('SLIPPAGE_LIMIT');
 const s=inspectCpmmSnapshot(snapshot,i.pool??LEGACY_POOL);
 if(![s.mint0,s.mint1].includes(SOL_MINT)||![s.mint0,s.mint1].includes(tokenMint)||s.mint0===s.mint1)reject('UNSUPPORTED_EXECUTION_VENUE');
 const direction=s.mint0===i.inputMint?0:s.mint1===i.inputMint?1:-1;
 if(direction<0||s['mint'+(1-direction)]!==i.outputMint)reject('UNSUPPORTED_EXECUTION_VENUE');
 const amount=integer(i.inputAmount),q=quoteCpmm(s,direction,amount,i.slippageBps);
 if(buy&&(amount<100000n||amount>1000000n))reject('CPMM_BUY_POLICY_RANGE');
 const wsol=ata(SOL_MINT,i.agentWallet),target=ata(tokenMint,i.agentWallet);
 if(!Array.isArray(agentAccounts)||agentAccounts.length!==2||new Set(agentAccounts.map(a=>a.address)).size!==2)reject('ATA_STATE_UNVERIFIED');
 const rent=integer(p.rentLamports),fee=integer(p.networkFeeCapLamports),balance=integer(p.agentBalanceLamports,{zero:true});
 if(fee>10000n||!Number.isSafeInteger(p.computeBudget?.units)||p.computeBudget.units<1||p.computeBudget.units>200000||!Number.isSafeInteger(p.computeBudget.microLamports)||p.computeBudget.microLamports<0||p.computeBudget.microLamports>25000)reject('COMPUTE_POLICY_INVALID');
 if(5000n+(BigInt(p.computeBudget.units)*BigInt(p.computeBudget.microLamports)+999999n)/1000000n>fee)reject('FEE_CAP_TOO_LOW');
 const states=[wsol,target].map((address,n)=>{
  const a=agentAccounts.find(a=>a.address===address);if(!a)reject('ATA_STATE_UNVERIFIED');
  if(a.info===null)return {address,exists:false,amount:0n};
  const info=a.info;if(!info||info.executable||info.owner!==TOKEN_PROGRAM_ID.toBase58()||!Number.isSafeInteger(info.lamports)||info.lamports<Number(rent))reject('ATA_PROVENANCE_INVALID');
  const data=Buffer.from(info.data,'base64');if(data.length!==165||data.toString('base64')!==info.data)reject('ATA_LAYOUT_INVALID');
  const x=unpackAccount(key(address),{...info,owner:key(info.owner),data},TOKEN_PROGRAM_ID);
  if(str(x.owner)!==i.agentWallet||str(x.mint)!==(n===0?SOL_MINT:tokenMint)||!x.isInitialized||x.isFrozen||x.delegate||x.closeAuthority||x.tlvData.length||x.isNative!==(n===0))reject('ATA_PROVENANCE_INVALID');
  if(n===0&&(x.amount!==0n||BigInt(info.lamports)!==x.rentExemptReserve))reject('WSOL_RESIDUAL_BALANCE');
  return {address,exists:true,amount:x.amount};
 });
 if(!buy&&(!states[1].exists||states[1].amount<amount))reject('SELL_SOURCE_INSUFFICIENT');
 const rentCost=rent*BigInt(states.filter(x=>!x.exists).length),maximumDebit=(buy?amount:0n)+fee+rentCost;
 if(balance<maximumDebit)reject('ENVELOPE_BALANCE_INSUFFICIENT');
 return {s,q,buy,direction,tokenMint,wsol,target,states,maximumDebit,rentCost,fee};
}

export function buildCpmmEnvelope(p){
 const c=cpmmEnvelopeContext(p),wallet=key(p.intent.agentWallet),ix=[ComputeBudgetProgram.setComputeUnitPrice({microLamports:p.computeBudget.microLamports}),ComputeBudgetProgram.setComputeUnitLimit({units:p.computeBudget.units})];
 for(const [n,a]of c.states.entries())if(!a.exists)ix.push(createAssociatedTokenAccountIdempotentInstruction(wallet,key(a.address),wallet,key(n===0?SOL_MINT:c.tokenMint)));
 if(c.buy)ix.push(SystemProgram.transfer({fromPubkey:wallet,toPubkey:key(c.wsol),lamports:c.q.amount}),createSyncNativeInstruction(key(c.wsol)));
 ix.push(buildCpmmSwap(c.s,p.intent.agentWallet,c.direction,c.q.amount,c.q.minimumOutput).instruction,createCloseAccountInstruction(key(c.wsol),wallet,wallet));
 const message=new TransactionMessage({payerKey:wallet,recentBlockhash:p.blockhash,instructions:ix}).compileToLegacyMessage();
 return Buffer.from(new VersionedTransaction(message).serialize()).toString('base64');
}

// Called by the complete transaction validator after canonical decoding. This
// state machine has no branch accepting arbitrary cleanup or extra instructions.
export function validateCpmmEnvelopeDecoded(d,p){
 const c=cpmmEnvelopeContext(p),i=p.intent,wallet=i.agentWallet;
 if(d.version!=='legacy'||d.feePayer!==wallet||d.signers.length!==1||d.signers[0]!==wallet||d.transaction.signatures.length!==1)reject('SIGNER_POLICY');
 if(p.requireSignature){if(!nacl.sign.detached.verify(d.messageBytes,d.transaction.signatures[0],key(wallet).toBytes()))reject('INVALID_SIGNATURE');}
 else if(d.transaction.signatures[0].some(b=>b!==0))reject('UNSIGNED_SIGNER_POLICY');
 eq(d.blockhash,p.blockhash,'BLOCKHASH_MISMATCH');if(p.expectedMessageHash)eq(d.messageHash,p.expectedMessageHash,'MESSAGE_MISMATCH');
 const writable=new Set([wallet,c.wsol,c.target,c.s.pool,c.s.vault0,c.s.vault1,c.s.observation]);
 const readonly=new Set([CPMM.toBase58(),TOKEN_PROGRAM_ID.toBase58(),ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),SystemProgram.programId.toBase58(),ComputeBudgetProgram.programId.toBase58(),c.s.authority,c.s.config,SOL_MINT,c.tokenMint]);
 for(const a of d.accounts)if(a.signer!==(a.address===wallet)||a.writable!==writable.has(a.address)||(!writable.has(a.address)&&!readonly.has(a.address)))reject('ACCOUNT_PRIVILEGE_OR_PROVENANCE');
 let index=0;
 const take=(program,addresses,data)=>{
  const x=d.instructions[index++];if(!x||str(x.programId)!==program||x.keys.length!==addresses.length||x.keys.some((k,n)=>str(k.pubkey)!==addresses[n])||!x.data.equals(data))reject('ENVELOPE_INSTRUCTION_MISMATCH');
 };
 const price=Buffer.alloc(9);price[0]=3;price.writeBigUInt64LE(BigInt(p.computeBudget.microLamports),1);
 const limit=Buffer.alloc(5);limit[0]=2;limit.writeUInt32LE(p.computeBudget.units,1);
 take(ComputeBudgetProgram.programId.toBase58(),[],price);take(ComputeBudgetProgram.programId.toBase58(),[],limit);
 // Independent mint-to-ATA derivation; metadata cannot select destinations.
 for(const mint of [SOL_MINT,c.tokenMint]){
  const address=ata(mint,wallet),state=c.states.find(s=>s.address===address);
  if(!state.exists)take(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),[wallet,address,wallet,mint,SystemProgram.programId.toBase58(),TOKEN_PROGRAM_ID.toBase58()],Buffer.from([1]));
 }
 if(c.buy){const transfer=Buffer.alloc(12);transfer.writeUInt32LE(2);transfer.writeBigUInt64LE(c.q.amount,4);take(SystemProgram.programId.toBase58(),[wallet,ata(SOL_MINT,wallet)],transfer);take(TOKEN_PROGRAM_ID.toBase58(),[c.wsol],Buffer.from([17]));}
 const swap=d.instructions[index++];if(!swap)reject('MISSING_SWAP');
 cpmmProofDecoder(c.s,wallet,c.direction,c.q.amount,c.q.minimumOutput)(swap);
 take(TOKEN_PROGRAM_ID.toBase58(),[c.wsol,wallet,wallet],Buffer.from([9]));
 if(index!==d.instructions.length)reject('EXTRA_INSTRUCTION');
 return {...d,status:'SUPPORTED_BY_VALIDATOR',executable:false,unexplainedWritableAccounts:0,maximumAgentDebitLamports:c.maximumDebit.toString(),rentCostLamports:c.rentCost.toString(),minimumOutput:c.q.minimumOutput.toString()};
}
