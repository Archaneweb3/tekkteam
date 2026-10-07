import {digest} from './dex/intent.js';

const fail=code=>{throw Object.assign(Error('BUDGET_'+code),{code:'BUDGET_'+code,status:409});};
const uint=value=>{if(typeof value!=='string'||!/^(0|[1-9]\d{0,19})$/.test(value)||BigInt(value)>18446744073709551615n)fail('AMOUNT');return BigInt(value);};
const text=value=>typeof value==='string'&&value.length>0&&value.length<=128;
const scope=['owner','agentId','wallet','mint','network'];
const keys=['authorizationId','authorizationRevision','authorizationDigest',...scope,'messageHash','maxDebitLamports','tradeInputLamports'];
const day=now=>new Date(now).toISOString().slice(0,10);
const sync=value=>{if(value?.then)fail('ASYNC_AUTHORITY_FORBIDDEN');return value;};

// Pure accounting hooks for the EXISTING balance reservation transaction. The
// resolver is a trusted synchronous DI port, never a browser plan or boolean.
// No production resolver, signing, approval or worker activation is mounted here.
export function createReservationBudget({readAuthority,now=Date.now,rows}={}){
 function authority(request){
  if(typeof readAuthority!=='function')fail('AUTHORITY_UNAVAILABLE');
  if(readAuthority.constructor.name==='AsyncFunction')fail('ASYNC_AUTHORITY_FORBIDDEN');
  const a=structuredClone(sync(readAuthority(structuredClone(request))));
  if(!a||a.status!=='ACTIVE'||a.authorizationGranted!==true||a.revoked===true||a.withdrawalEnabled!==false)fail('AUTHORITY_INACTIVE');
  if(a.id!==request.authorizationId||a.revision!==request.authorizationRevision||a.digest!==request.authorizationDigest||scope.some(k=>a[k]!==request[k])||a.network!=='solana:101'||!text(a.sessionId))fail('AUTHORITY_BINDING');
  const {digest:proof,...body}=a;if(digest(body)!==proof)fail('AUTHORITY_DIGEST');
  const at=now();if(!Number.isSafeInteger(at)||!Number.isSafeInteger(a.startsAt)||!Number.isSafeInteger(a.expiresAt)||a.startsAt>at||a.expiresAt<=at||a.expiresAt<=a.startsAt||a.expiresAt-a.startsAt>86400000)fail('AUTHORITY_EXPIRED');
  for(const k of ['maxTransactions','maxDailyTransactions'])if(!Number.isSafeInteger(a[k])||a[k]<1||a[k]>1000)fail('AUTHORITY_LIMIT');
  const per=uint(a.perTradeLamports),session=uint(a.sessionDebitLamports),daily=uint(a.dailyDebitLamports);
  if(per===0n||session<per||daily<session||uint(request.tradeInputLamports)>per||uint(request.maxDebitLamports)<uint(request.tradeInputLamports)||uint(request.maxDebitLamports)>session)fail('AUTHORITY_LIMIT');
  return a;
 }
 function request(value){
  if(!value||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||['authorizationId',...scope].some(k=>!text(value[k]))||!Number.isSafeInteger(value.authorizationRevision)||value.authorizationRevision<1||! /^[a-f0-9]{64}$/.test(value.authorizationDigest)||! /^[a-f0-9]{64}$/.test(value.messageHash))fail('REQUEST');
  uint(value.maxDebitLamports);uint(value.tradeInputLamports);return structuredClone(value);
 }
 function integrity(b){
  if(!b||b.schema!=='REAL_RESERVATION_BUDGET_V1'||b.allocationHash!==digest({request:b.request,authority:b.authority,day:b.day})||!/^\d{4}-\d{2}-\d{2}$/.test(b.day))fail('INTEGRITY');
  request(b.request);return b;
 }
 function usage(b,status){
  integrity(b);
  const closed=['CONFIRMED','FAILED','CANCELLED','EXPIRED','REJECTED_BEFORE_SIGNING'].includes(status);
  return {debit:b.settledDebitLamports!=null?uint(b.settledDebitLamports):closed&&b.claimedAt===null?0n:uint(b.request.maxDebitLamports),count:b.claimedAt!==null||!closed?1:0};
 }
 function limits(b,id,a){
  let session=uint(b.request.maxDebitLamports),daily=session,count=1,dailyCount=1;
  for(const r of rows()){
   if(r.operationId===id||!r.budget)continue;const x=integrity(r.budget);
   if(['owner','agentId','network'].some(k=>x.request[k]!==b.request[k]))continue;
   const u=usage(x,r.status);
   if(x.authority.sessionId===a.sessionId){session+=u.debit;count+=u.count;}
   if(x.day===b.day||x.settledDebitLamports===null){daily+=u.debit;dailyCount+=u.count;}
  }
  if(session>uint(a.sessionDebitLamports)||daily>uint(a.dailyDebitLamports))fail('DEBIT_EXHAUSTED');
  if(count>a.maxTransactions||dailyCount>a.maxDailyTransactions)fail('COUNT_EXHAUSTED');
 }
 return Object.freeze({
  reserve(spec,old){
   if(old?.budget){integrity(old.budget);if(Object.hasOwn(spec,'budget')&&(!spec.budget||digest(spec.budget)!==digest(old.budget.request)&&digest(spec.budget)!==digest(old.budget)))fail('ALLOCATION_MUTATION');if(old.budget.claimedAt===null&&(spec.signature||['SIGNED','SUBMITTED'].includes(spec.status)))fail('CLAIM_REQUIRED');return old.budget;}
   if(!Object.hasOwn(spec,'budget'))return undefined;
   if(old)fail('RETROACTIVE_ALLOCATION');
   if(spec.signature||!['PREPARING','PREPARED'].includes(spec.status??'PREPARED'))fail('INITIAL_UNSIGNED_REQUIRED');
   const r=request(spec.budget),a=authority(r);
   if(spec.resources.length!==1||spec.resources[0].wallet!==r.wallet||uint(spec.resources[0].lamports)>uint(r.maxDebitLamports))fail('RESOURCE_BINDING');
   const body={request:r,authority:a,day:day(now())},b={schema:'REAL_RESERVATION_BUDGET_V1',...body,allocationHash:digest(body),claimedAt:null,settledDebitLamports:null,settlementDigest:null};limits(b,spec.operationId,a);return b;
  },
  claim(record,messageHash){
   const b=integrity(record?.budget);if(record.status!=='UNKNOWN'||b.claimedAt!==null)fail('CLAIM_STATE');
   if(messageHash!==b.request.messageHash)fail('MESSAGE_CHANGED');
   if(day(now())!==b.day)fail('DAY_CHANGED');
   const a=authority(b.request);limits(b,record.operationId,a);
   return {...b,claimedAt:now()};
  },
  assertBroadcast(record,messageHash){
   const b=integrity(record?.budget);if(b.claimedAt===null||messageHash!==b.request.messageHash||b.settledDebitLamports!==null)fail('CLAIM_STATE');
   if(day(now())!==b.day)fail('DAY_CHANGED');authority(b.request);return true;
  },
  finish(record,status,evidence){
   const b=integrity(record.budget);
   if(b.settlementDigest!==null){if(b.settlementDigest!==digest({status,evidence}))fail('SETTLEMENT_CONFLICT');return b;}
   let spent=0n;
   if(b.claimedAt===null&&(status==='CONFIRMED'||record.signature||['SIGNED','SUBMITTED'].includes(record.status)))fail('CLAIM_REQUIRED');
   if(b.claimedAt!==null){
    if(evidence.provenTerminal!==true||evidence.budgetMessageHash!==b.request.messageHash)fail('FINALITY_REQUIRED');
    spent=uint(evidence.budgetDebitLamports);
    if(spent>uint(b.request.maxDebitLamports))fail('SETTLEMENT_EXCEEDS_CEILING');
    if(status==='FAILED'&&spent!==uint(evidence.networkFeeLamports))fail('FAILED_FEE_ONLY');
   }
   return {...b,settledDebitLamports:spent.toString(),settlementDigest:digest({status,evidence})};
  }
 });
}
