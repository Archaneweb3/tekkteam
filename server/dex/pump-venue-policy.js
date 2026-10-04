import {PublicKey} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {PUMP,PUMP_COMMIT,GENESIS} from '../../src/pump-readiness.js';

const SOL='So11111111111111111111111111111111111111112';
const fail=code=>{throw Object.assign(Error(code),{code});};
const key=value=>{try{return new PublicKey(value).toBase58();}catch{fail('PUMP_PROOF_ADDRESS_INVALID');}};
const integer=value=>Number.isSafeInteger(value)&&value>=0;

// Pure offline shape/binding policy, NOT an RPC verifier or execution capability.
// Proof input must come from an independently qualified account decoder; callers
// cannot turn this derived descriptor into signing, quote or trading authority.
export function deriveDisarmedPumpVenue({agent,receipt,proof,direction,inputMint,outputMint,currentSlot,maxAgeSlots}={}){
 if(!agent?.id||!agent.creator||receipt?.agentId!==agent.id||receipt.owner!==agent.creator||receipt.network!=='solana:101'||receipt.status!=='Success'||receipt.confirmed!==true||typeof receipt.signature!=='string'||!receipt.signature.trim())fail('PUMP_ASSOCIATION_UNVERIFIED');
 const mint=key(receipt.mint),owner=key(agent.creator);
 if(mint===SOL||inputMint===outputMint)fail('PUMP_ASSOCIATED_PAIR_MISMATCH');
 if(!['BUY','SELL'].includes(direction))fail('PUMP_DIRECTION_UNSUPPORTED');
 if(inputMint!==(direction==='BUY'?SOL:mint)||outputMint!==(direction==='BUY'?mint:SOL))fail('PUMP_ASSOCIATED_PAIR_MISMATCH');
 if(proof?.schema!=='PUMP_CURVE_DECODED_V1'||proof.idlCommit!==PUMP_COMMIT||proof.network!=='solana:101'||proof.genesis!==GENESIS)fail('PUMP_PROOF_CONTEXT_UNVERIFIED');
 if(!integer(currentSlot)||!integer(maxAgeSlots)||!integer(proof.slot)||proof.slot>currentSlot||currentSlot-proof.slot>maxAgeSlots)fail('PUMP_PROOF_STALE');
 const curve=proof.curve,token=proof.mint;
 if(curve?.slot!==proof.slot||token?.slot!==proof.slot)fail('PUMP_PROOF_SLOT_DISAGREEMENT');
 if(curve?.exists!==true||curve.executable!==false||curve.programOwner!==PUMP||curve.programId!==PUMP||key(curve.mint)!==mint||key(curve.creator)!==owner)fail('PUMP_CURVE_BINDING_INVALID');
 const expected=PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'),new PublicKey(mint).toBuffer()],new PublicKey(PUMP))[0].toBase58();
 if(key(curve.address)!==expected)fail('PUMP_CURVE_PDA_MISMATCH');
 if(token?.exists!==true||token.executable!==false||key(token.address)!==mint||token.programOwner!==TOKEN_2022_PROGRAM_ID.toBase58()||token.isInitialized!==true||!Array.isArray(token.extensions)||token.extensions.length!==0)fail('PUMP_TOKEN_PROGRAM_UNQUALIFIED');
 if(typeof curve.complete!=='boolean'||curve.isMayhemMode!==false||curve.isCashbackCoin!==false)fail('PUMP_CURVE_MODE_UNQUALIFIED');
 if(curve.complete)fail('MIGRATED_VENUE_UNVERIFIED');
 return Object.freeze({state:'DISARMED',kind:'PUMP_BONDING_CURVE',agentId:agent.id,owner,mint,programId:PUMP,curve:expected,tokenProgram:token.programOwner,quoteMint:SOL,direction,inputMint,outputMint,slot:proof.slot,idlCommit:PUMP_COMMIT,provenance:'DERIVED',reason:'OFFLINE_BINDING_ONLY_EXECUTOR_UNQUALIFIED',onChainVerified:false,enabled:false,authorizationGranted:false});
}
