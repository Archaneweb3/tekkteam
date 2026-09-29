import {PublicKey} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,TOKEN_PROGRAM_ID} from '@solana/spl-token';

export const NARROW_IDL_SHA256='cf5b1abb503ba25caf3423a89e29c7aa127c44867fabe6a22e143c554d813b7d';
export const NARROW_OBSERVATION_POLICY=Object.freeze({version:'jupiter-deriverse-observation-v1',idlSha256:NARROW_IDL_SHA256,routeDiscriminator:'bb64facc31c4af14',expectedPayloadBytes:44,expectedMetaCount:26,approved:false,approvedCpiPrograms:Object.freeze([])});
const ROUTER='JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const fail=code=>{throw new Error(code);};
// Observation only: this pinned, on-chain-published IDL explains top-level
// serialization, not Deriverse CPI semantics or deployed-program correctness.
export function observeSingleDeriverseRoute(ix,intent,{idlHash=NARROW_IDL_SHA256,quotedOutAmount,slippageBps=intent.slippageBps}={}){
 if(idlHash!==NARROW_IDL_SHA256)fail('IDL_PIN_MISMATCH');
 if(ix.programId!==ROUTER)fail('ROUTER_MISMATCH');
 const b=Buffer.from(ix.data,'base64');
 if(typeof ix.data!=='string'||b.toString('base64')!==ix.data)fail('NONCANONICAL_INSTRUCTION_ENCODING');
 if(b.length!==44||b.subarray(0,8).toString('hex')!=='bb64facc31c4af14')fail('NARROW_LAYOUT_MISMATCH');
 if(b.readUInt32LE(30)!==1||b[34]!==161||b[35]>1||b.readUInt16LE(40)!==10000||b[42]!==0||b[43]!==1)fail('UNSUPPORTED_ROUTE_SHAPE');
 const input=b.readBigUInt64LE(8),quoted=b.readBigUInt64LE(16),slippage=b.readUInt16LE(24);
 if(input!==BigInt(intent.inputAmount)||quoted<=0n||(quotedOutAmount!==undefined&&quoted!==BigInt(quotedOutAmount))||slippage!==Number(slippageBps)||slippage>100)fail('ROUTE_ECONOMICS_MISMATCH');
 if(b.readUInt16LE(26)!==0||b.readUInt16LE(28)!==0)fail('UNAPPROVED_ROUTE_FEES');
 const a=ix.accounts;
 if(!Array.isArray(a)||a.length!==26)fail('UNSUPPORTED_ACCOUNT_COUNT');
 const ata=mint=>getAssociatedTokenAddressSync(new PublicKey(mint),new PublicKey(intent.agentWallet)).toBase58();
 const expected=[intent.agentWallet,ata(intent.inputMint),ata(intent.outputMint),intent.inputMint,intent.outputMint,TOKEN_PROGRAM_ID.toBase58(),TOKEN_PROGRAM_ID.toBase58(),ROUTER,'D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf',ROUTER];
 for(let i=0;i<10;i++)if(a[i].pubkey!==expected[i]||a[i].isSigner!==(i===0)||a[i].isWritable!==([1,2].includes(i)))fail('TOP_LEVEL_ROLE_MISMATCH');
 return {supported:false,executable:false,reason:'UNPROVEN_DERIVERSE_CPI_AND_DEPLOYED_SEMANTICS',idlHash,inAmount:input.toString(),quotedOutAmount:quoted.toString(),slippageBps:slippage,platformFeeBps:0,positiveSlippageBps:0,route:{variant:'Deriverse',sideDiscriminant:b[35],instrumentId:b.readUInt32LE(36),bps:10000,inputIndex:0,outputIndex:1},consumedBytes:b.length,remainingAccounts:a.slice(10)};
}
