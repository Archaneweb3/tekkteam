import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {PUMP,PUMP_COMMIT,GENESIS} from '../src/pump-readiness.js';
import {deriveDisarmedPumpVenue} from '../server/dex/pump-venue-policy.js';
const owner='11111111111111111111111111111111',mint='So11111111111111111111111111111111111111111',sol='So11111111111111111111111111111111111111112';
const curve=PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'),new PublicKey(mint).toBuffer()],new PublicKey(PUMP))[0].toBase58();
function fixture(direction='BUY'){
 return {agent:{id:'fixture',creator:owner},receipt:{agentId:'fixture',owner,network:'solana:101',status:'Success',confirmed:true,signature:'fixture-recorded-signature',mint},direction,inputMint:direction==='BUY'?sol:mint,outputMint:direction==='BUY'?mint:sol,currentSlot:100,maxAgeSlots:5,proof:{schema:'PUMP_CURVE_DECODED_V1',idlCommit:PUMP_COMMIT,network:'solana:101',genesis:GENESIS,slot:99,curve:{slot:99,exists:true,executable:false,programOwner:PUMP,programId:PUMP,address:curve,mint,creator:owner,complete:false,isMayhemMode:false,isCashbackCoin:false},mint:{slot:99,address:mint,exists:true,executable:false,programOwner:TOKEN_2022_PROGRAM_ID.toBase58(),isInitialized:true,extensions:[]}}};
}
for(const direction of ['BUY','SELL'])test(`${direction} offline association stays immutable, derived and disarmed`,()=>{
 const input=fixture(direction),before=JSON.stringify(input),result=deriveDisarmedPumpVenue(input);
 assert.equal(Object.isFrozen(result),true);assert.equal(result.kind,'PUMP_BONDING_CURVE');assert.equal(result.mint,mint);assert.equal(result.direction,direction);assert.equal(result.enabled,false);assert.equal(result.authorizationGranted,false);assert.equal(result.onChainVerified,false);assert.equal(result.provenance,'DERIVED');assert.equal(JSON.stringify(input),before);
});
const negatives=[
 ['SOL masquerading as associated coin',x=>{x.receipt.mint=sol;x.inputMint=sol;x.outputMint=sol;},'PUMP_ASSOCIATED_PAIR_MISMATCH'],
 ['equal pair',x=>{x.outputMint=x.inputMint;},'PUMP_ASSOCIATED_PAIR_MISMATCH'],
 ['missing receipt',x=>{x.receipt=null;},'PUMP_ASSOCIATION_UNVERIFIED'],
 ['foreign owner',x=>{x.receipt.owner=mint;},'PUMP_ASSOCIATION_UNVERIFIED'],
 ['wrong Agent',x=>{x.receipt.agentId='other';},'PUMP_ASSOCIATION_UNVERIFIED'],
 ['unconfirmed',x=>{x.receipt.confirmed=false;},'PUMP_ASSOCIATION_UNVERIFIED'],
 ['Devnet receipt',x=>{x.receipt.network='solana:103';},'PUMP_ASSOCIATION_UNVERIFIED'],
 ['foreign pair',x=>{x.outputMint=owner;},'PUMP_ASSOCIATED_PAIR_MISMATCH'],
 ['unsupported direction',x=>{x.direction='SWAP';},'PUMP_DIRECTION_UNSUPPORTED'],
 ['missing proof',x=>{x.proof=null;},'PUMP_PROOF_CONTEXT_UNVERIFIED'],
 ['wrong schema',x=>{x.proof.schema='UNKNOWN';},'PUMP_PROOF_CONTEXT_UNVERIFIED'],
 ['unpinned IDL',x=>{x.proof.idlCommit='main';},'PUMP_PROOF_CONTEXT_UNVERIFIED'],
 ['wrong genesis',x=>{x.proof.genesis=owner;},'PUMP_PROOF_CONTEXT_UNVERIFIED'],
 ['stale slot',x=>{x.proof.slot=94;},'PUMP_PROOF_STALE'],
 ['future slot',x=>{x.proof.slot=101;},'PUMP_PROOF_STALE'],
 ['missing age policy',x=>{delete x.maxAgeSlots;},'PUMP_PROOF_STALE'],
 ['mixed slots',x=>{x.proof.curve.slot=98;},'PUMP_PROOF_SLOT_DISAGREEMENT'],
 ['wrong curve owner',x=>{x.proof.curve.programOwner=owner;},'PUMP_CURVE_BINDING_INVALID'],
 ['wrong curve mint',x=>{x.proof.curve.mint=sol;},'PUMP_CURVE_BINDING_INVALID'],
 ['wrong coin creator',x=>{x.proof.curve.creator=mint;},'PUMP_CURVE_BINDING_INVALID'],
 ['wrong curve PDA',x=>{x.proof.curve.address=owner;},'PUMP_CURVE_PDA_MISMATCH'],
 ['classic token',x=>{x.proof.mint.programOwner=owner;},'PUMP_TOKEN_PROGRAM_UNQUALIFIED'],
 ['unqualified extension',x=>{x.proof.mint.extensions=['TransferFeeConfig'];},'PUMP_TOKEN_PROGRAM_UNQUALIFIED'],
 ['uninitialized mint',x=>{x.proof.mint.isInitialized=false;},'PUMP_TOKEN_PROGRAM_UNQUALIFIED'],
 ['unqualified mode',x=>{x.proof.curve.isMayhemMode=true;},'PUMP_CURVE_MODE_UNQUALIFIED'],
 ['completed without pool proof',x=>{x.proof.curve.complete=true;},'MIGRATED_VENUE_UNVERIFIED'],
];
for(const [name,mutate,code]of negatives)test(`reject ${name}`,()=>{const input=fixture();mutate(input);assert.throws(()=>deriveDisarmedPumpVenue(input),error=>error.code===code);});
