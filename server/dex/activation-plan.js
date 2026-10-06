import {AUTONOMOUS_V1} from './autonomous-v1.js';
import {DEFAULT_RISK_POLICY,digest,integer,reject} from './intent.js';
import {PERSONALITIES,PERSONALITY_VERSION} from '../../public/app/agent-personalities.js';

// A durable owner configuration review, not an execution capability. No approve,
// signer, sender, worker-start or lifecycle-enabling method exists in this store.
export const ACTIVATION_PLAN_LIMITS=Object.freeze({maxDurationMinutes:1440,maxTransactions:10,maxPerTradeLamports:AUTONOMOUS_V1.maxBuyLamports,maxSessionDebitLamports:AUTONOMOUS_V1.maxDailyTurnoverLamports,maxDailyDebitLamports:AUTONOMOUS_V1.maxDailyTurnoverLamports,maxSlippageBps:AUTONOMOUS_V1.maxSlippageBps,maxNetworkFeeLamports:DEFAULT_RISK_POLICY.maxNetworkFeeLamports});
export const DEFAULT_ACTIVATION_PLAN=Object.freeze({personality:'operator',durationMinutes:60,perTradeLamports:'100000',sessionDebitLamports:'500000',dailyDebitLamports:'500000',maxTransactions:4,slippageBps:100});
const fields=Object.keys(DEFAULT_ACTIVATION_PLAN);
export function normalizeActivationPlan(value){
 if(!value||Object.keys(value).length!==fields.length||Object.keys(value).some(k=>!fields.includes(k)))reject('ACTIVATION_PLAN_FIELDS');
 if(!Object.hasOwn(PERSONALITIES,value.personality))reject('ACTIVATION_PERSONALITY_REQUIRED');
 for(const key of ['perTradeLamports','sessionDebitLamports','dailyDebitLamports'])if(typeof value[key]!=='string'||value[key].length>20)reject('ACTIVATION_PLAN_LIMIT');
 for(const [key,min,max] of [['durationMinutes',1,1440],['maxTransactions',1,10],['slippageBps',0,AUTONOMOUS_V1.maxSlippageBps]])if(!Number.isSafeInteger(value[key])||value[key]<min||value[key]>max)reject('ACTIVATION_PLAN_LIMIT');
 const perTrade=integer(value.perTradeLamports),session=integer(value.sessionDebitLamports),daily=integer(value.dailyDebitLamports);
 if(perTrade>BigInt(AUTONOMOUS_V1.maxBuyLamports)||session>BigInt(AUTONOMOUS_V1.maxDailyTurnoverLamports)||daily>BigInt(AUTONOMOUS_V1.maxDailyTurnoverLamports)||perTrade>session||session>daily||session<perTrade+BigInt(DEFAULT_RISK_POLICY.maxNetworkFeeLamports))reject('ACTIVATION_PLAN_LIMIT');
 return Object.fromEntries(fields.map(k=>[k,value[k]]));
}
export function createActivationPlans(db,{readAuthority,now=Date.now}={}){
 if(typeof readAuthority!=='function')reject('ACTIVATION_AUTHORITY_REQUIRED');
 db.exec('CREATE TABLE IF NOT EXISTS dex_activation_plans(agent_id TEXT PRIMARY KEY,owner TEXT NOT NULL,data TEXT NOT NULL)');
 const binding=agent=>{const authority=readAuthority(agent);if(authority?.kind!=='LAUNCHPAD'||authority.owner!==agent.creator||authority.agentId!==agent.id||authority.network!=='solana:101'||!Number.isSafeInteger(authority.confirmedSlot)||authority.confirmedSlot<=0)reject('ACTIVATION_CONFIRMED_LAUNCH_REQUIRED');return {...authority,personalityVersion:PERSONALITY_VERSION,route:'PUMP_BONDING_CURVE_V1'};};
 const load=agent=>{const row=db.prepare('SELECT owner,data FROM dex_activation_plans WHERE agent_id=?').get(agent.id);if(!row)return null;if(row.owner!==agent.creator)reject('ACTIVATION_OWNER_MISMATCH');const r=JSON.parse(row.data);const {planDigest,...body}=r;if(digest(body)!==planDigest||r.owner!==agent.creator||r.agentId!==agent.id||r.authorizationGranted!==false||!['DRAFT','CANCELLED'].includes(r.status))reject('ACTIVATION_PLAN_INTEGRITY');return r;};
 const response=(agent,r,scope)=>({agentId:agent.id,owner:agent.creator,network:'solana:101',plan:r,defaults:{...DEFAULT_ACTIVATION_PLAN,personality:Object.hasOwn(PERSONALITIES,agent.strategy)?agent.strategy:'operator'},limits:ACTIVATION_PLAN_LIMITS,scope,current:r?digest(r.scope)===digest(scope):true,authorizationGranted:false,activationEnabled:false,blockers:['PUMP_EXECUTION_NOT_QUALIFIED','OWNER_ACTIVATION_REQUIRED'],withdrawalEnabled:false});
 return Object.freeze({
  read(agent){const scope=binding(agent);return response(agent,load(agent),scope);},
  save(agent,{revision,policy}={}){
   if(!Number.isSafeInteger(revision)||revision<0)reject('ACTIVATION_REVISION');
   const scope=binding(agent),normalized=normalizeActivationPlan(policy);
   db.exec('BEGIN IMMEDIATE');try{
    const old=load(agent);if((old?.revision??0)!==revision)reject('ACTIVATION_REVISION_CHANGED');
    if(old?.status==='DRAFT'&&digest(old.scope)===digest(scope)&&digest(old.policy)===digest(normalized)){db.exec('COMMIT');return response(agent,old,scope);}
    const body={version:1,agentId:agent.id,owner:agent.creator,status:'DRAFT',revision:revision+1,scope,policy:normalized,networkFeeCapLamports:DEFAULT_RISK_POLICY.maxNetworkFeeLamports,protectedReserveLamports:String(BigInt(DEFAULT_RISK_POLICY.minReserveLamports)+BigInt(DEFAULT_RISK_POLICY.futureSellFeeLamports)+BigInt(DEFAULT_RISK_POLICY.reconciliationMarginLamports)),authorizationGranted:false,withdrawalEnabled:false,createdAt:old?.createdAt??now(),updatedAt:now(),startsAt:null,expiresAt:null};
    const r={...body,planDigest:digest(body)};db.prepare('INSERT INTO dex_activation_plans VALUES(?,?,?) ON CONFLICT(agent_id) DO UPDATE SET owner=excluded.owner,data=excluded.data').run(agent.id,agent.creator,JSON.stringify(r));db.exec('COMMIT');return response(agent,r,scope);
   }catch(e){db.exec('ROLLBACK');throw e;}
  },
  cancel(agent,{revision}={}){
   // Cancellation needs owner identity only; RPC, receipt readiness or a future
   // expired execution review can never prevent withdrawal of draft intent.
   db.exec('BEGIN IMMEDIATE');try{const old=load(agent);if(!old||old.revision!==revision)reject('ACTIVATION_REVISION_CHANGED');const {planDigest,...prior}=old;const body={...prior,status:'CANCELLED',revision:old.revision+1,updatedAt:now()},r={...body,planDigest:digest(body)};db.prepare('UPDATE dex_activation_plans SET data=? WHERE agent_id=? AND owner=?').run(JSON.stringify(r),agent.id,agent.creator);db.exec('COMMIT');return {agentId:agent.id,plan:r,authorizationGranted:false,activationEnabled:false};}catch(e){db.exec('ROLLBACK');throw e;}
  }
 });
}
