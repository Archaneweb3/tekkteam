import {VersionedTransaction,PublicKey} from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {createHash} from 'node:crypto';
import {digest,integer,reject,SOL_MINT} from './intent.js';
import {GENESIS} from '../../src/pump-readiness.js';
import {evaluatePumpRuntimeRisk} from './pump-runtime-risk.js';

const hash=x=>createHash('sha256').update(x).digest('hex');
function transaction(encoded,record,{signed=false}={}){
 let tx;try{if(typeof encoded!=='string'||Buffer.from(encoded,'base64').toString('base64')!==encoded||Buffer.from(encoded,'base64').length>1232)throw Error();tx=VersionedTransaction.deserialize(Buffer.from(encoded,'base64'));}catch{reject('PUMP_RUNTIME_TRANSACTION_INVALID');}
 const m=tx.message;
 if(m.version!==0||m.addressTableLookups.length||m.header.numRequiredSignatures!==1||!m.staticAccountKeys[0].equals(new PublicKey(record.intent.agentWallet))||hash(m.serialize())!==record.plan.messageHash)reject('PUMP_RUNTIME_MESSAGE_BINDING');
 if(signed){if(bs58.encode(tx.signatures[0])!==record.signature||!nacl.sign.detached.verify(m.serialize(),tx.signatures[0],m.staticAccountKeys[0].toBytes()))reject('PUMP_RUNTIME_SIGNATURE_INVALID');}
 else if(tx.signatures.some(s=>s.some(x=>x!==0)))reject('PUMP_RUNTIME_SIGNED_PREPARATION');
 return tx;
}

// No signer, broadcaster, automatic worker or network fallback exists here.
export function createPumpRuntimeExecutor({ledger,adapter,readContext,source='LOCAL_FIXTURE',riskPolicy,now=Date.now}={}){
 const guard=async(actor,intent,{passive=false}={})=>{
  const c=await readContext(actor,intent.agentId);
  if(c?.authenticated!==true||c.owner!==intent.owner||c.agentId!==intent.agentId||c.agentWallet!==intent.agentWallet||c.network!=='solana:101'||c.genesis!==GENESIS||c.associatedMint!==(intent.side==='BUY'?intent.outputMint:intent.inputMint)||c.authorityVerified!==true||!Number.isSafeInteger(c.revision)||c.revision<0)reject('PUMP_RUNTIME_AUTHORITY');
  if(!passive&&(c.paused!==false||c.killSwitch!==false||c.emergencyStop!==false||c.enabled!==true||c.liveEnabled!==false||c.broadcastEnabled!==false))reject('PUMP_RUNTIME_PAUSED_OR_DISARMED');
  return structuredClone(c);
 };
 const owned=async(actor,id,passive=false)=>{const r=ledger.get(id);if(!r)reject('PUMP_RUNTIME_NOT_FOUND');return {r,c:await guard(actor,r.intent,{passive})};};
 const same=(a,b)=>{if(digest(a)!==digest(b))reject('PUMP_RUNTIME_CONTEXT_CHANGED');};
 const fresh=r=>{if(now()>=r.intent.expiresAt||now()>=r.plan.quote.expiresAt)reject('PUMP_RUNTIME_EXPIRED');};
 return {
  async prepare(actor,body){
   if(!adapter)reject('PUMP_RUNTIME_ADAPTER_UNAVAILABLE');
   if(!body||Object.keys(body).some(k=>!['agentId','owner','agentWallet','network','genesis','side','inputMint','outputMint','inputAmount','slippageBps','expiresAt','requestKey'].includes(k)))reject('PUMP_RUNTIME_INTENT_FIELDS');
   const {requestKey,...intent}=structuredClone(body);
   if(intent.network!=='solana:101'||intent.genesis!==GENESIS||!['BUY','SELL'].includes(intent.side)||(intent.side==='BUY'?intent.inputMint:intent.outputMint)!==SOL_MINT||!Number.isSafeInteger(intent.expiresAt)||intent.expiresAt<=now()||intent.expiresAt>now()+30000||!Number.isSafeInteger(intent.slippageBps)||intent.slippageBps<0||intent.slippageBps>100)reject('PUMP_RUNTIME_INTENT');
   integer(intent.inputAmount);const c=await guard(actor,intent);
   const existing=ledger.lookup(intent,requestKey);if(existing)return existing;
   if(source!=='LOCAL_FIXTURE'&&adapter.qualification?.()!==true)reject('PUMP_RUNTIME_VENUE_NOT_QUALIFIED');
   const plan=structuredClone(await adapter.prepare(structuredClone(intent),structuredClone(c),async()=>same(c,await guard(actor,intent))));same(c,await guard(actor,intent));
   if(plan?.source!==source||!['PUMP_BONDING_CURVE','PUMPSWAP'].includes(plan.venueKind)||plan.quote?.side!==intent.side||plan.quote.agentId!==intent.agentId||plan.quote.slippageBps!==intent.slippageBps||plan.quote.expiresAt>intent.expiresAt||plan.quote.expiresAt<=now())reject('PUMP_RUNTIME_PLAN');
   const r={intent,plan};transaction(plan.unsignedTransaction,r);
   if(await adapter.verifyPrepared(structuredClone(r))!==true)reject('PUMP_RUNTIME_PREPARATION_UNVERIFIED');same(c,await guard(actor,intent));fresh(r);
   plan.risk=evaluatePumpRuntimeRisk(intent,plan,riskPolicy,now());
   if(plan.risk.expiresAt<=now())reject('PUMP_RUNTIME_RISK_EXPIRED');
   return ledger.prepare({intent,plan,requestKey});
  },
  // Trusted in-process import of an already-existing signed transaction only.
  // Never exposed as HTTP submit/sign/send; fixtures use synthetic transaction bytes.
  async trackPending(actor,id,encoded){const {r,c}=await owned(actor,id);fresh(r);if(now()>=r.plan.risk.expiresAt)reject('PUMP_RUNTIME_RISK_EXPIRED');const tx=VersionedTransaction.deserialize(Buffer.from(encoded,'base64')),signature=bs58.encode(tx.signatures[0]);transaction(encoded,{...r,signature},{signed:true});same(c,await guard(actor,r.intent));fresh(r);if(now()>=r.plan.risk.expiresAt)reject('PUMP_RUNTIME_RISK_EXPIRED');return ledger.trackPending(id,{signature,messageHash:r.plan.messageHash});},
  async reconcile(actor,id){
   const {r}=await owned(actor,id,true);if(r.status!=='UNKNOWN'||!r.signature)return r;
   if(!adapter)reject('PUMP_RUNTIME_ADAPTER_UNAVAILABLE');
   const observation=structuredClone(await adapter.readFinalized(r.signature,structuredClone(r)));await guard(actor,r.intent,{passive:true});
   if(!observation||observation.finalized!==true)return ledger.get(id);
   if(observation.source!==source||observation.signature!==r.signature||observation.network!=='solana:101'||observation.genesis!==GENESIS)reject('PUMP_RUNTIME_FINALITY_BINDING');
   if(!Object.hasOwn(observation,'error')||(observation.error!==null&&(typeof observation.error!=='string'||!observation.error.length)&&(typeof observation.error!=='object'||Array.isArray(observation.error)||!Object.keys(observation.error).length))||!Number.isSafeInteger(observation.slot)||observation.slot<r.plan.snapshotSlot)reject('PUMP_RUNTIME_FINALITY_CLASSIFICATION');
   transaction(observation.transaction,r,{signed:true});
   const effects=structuredClone(await adapter.verifyFinalizedEffects(structuredClone(r),structuredClone(observation)));await guard(actor,r.intent,{passive:true});
   if(!effects)reject('PUMP_RUNTIME_EFFECTS_UNVERIFIED');
   return ledger.settle(id,{source,executionId:id,signature:r.signature,messageHash:r.plan.messageHash,network:r.intent.network,genesis:r.intent.genesis,owner:r.intent.owner,agentId:r.intent.agentId,agentWallet:r.intent.agentWallet,inputMint:r.intent.inputMint,outputMint:r.intent.outputMint,slot:observation.slot,finalized:true,error:observation.error,effects});
  },
  async cancel(actor,id){const {r}=await owned(actor,id,true);return ledger.cancel(r.id);},
  async read(actor,id){const {r}=await owned(actor,id,true);return {record:r,receipt:ledger.receipt(id),reservation:ledger.reservation(id),notBroadcast:true};}
 };
}
