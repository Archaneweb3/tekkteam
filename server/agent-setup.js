import {PublicKey} from '@solana/web3.js';
import {DEFAULT_RISK_POLICY} from './dex/intent.js';

const uint=value=>{if(!/^(0|[1-9]\d*)$/.test(String(value)))throw Error('Invalid accounting');return BigInt(value);};
const address=value=>{try{return typeof value==='string'&&new PublicKey(value).toBase58()===value;}catch{return false;}};
const table=(db,name)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const unavailable=reason=>({available:false,reason});

// Read-only projection. Receipt authority is supplied by the existing canonical
// receipt reader (including Policy101), never inferred from names or timestamps.
export function readAgentSetupFacts({db,agent,owner,evidence}){
 if(!agent||agent.creator!==owner)return unavailable('OWNER_MISMATCH');
 const row=db.prepare('SELECT owner FROM agents WHERE id=?').get(agent.id);
 if(row?.owner!==owner)return unavailable('OWNER_MISMATCH');
 if(evidence?.available!==true)return unavailable('RECEIPT_UNAVAILABLE');
 const r=evidence.receipt;
 if(!r)return agent.launchWalletBinding||table(db,'launch_agent_bindings')&&db.prepare('SELECT 1 FROM launch_agent_bindings WHERE agent_id=?').get(agent.id)?unavailable('RECEIPT_UNAVAILABLE'):{available:true,launched:false};
 if(r.confirmed!==true||r.status!=='Success'||r.network!=='solana:101'||r.agentId!==agent.id||r.owner!==owner||!r.signature||!r.executionId||!Number.isSafeInteger(r.confirmedSlot)||r.confirmedSlot<=0||r.pumpProvenance!=='FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR'||!address(r.mint))return unavailable('LAUNCH_RECONCILIATION_REQUIRED');
 if(!table(db,'launch_agent_bindings')||!table(db,'agent_wallets'))return unavailable('WALLET_PROVISIONING_REQUIRED');
 const binding=db.prepare('SELECT * FROM launch_agent_bindings WHERE agent_id=?').get(agent.id);
 const wallet=db.prepare('SELECT address,length(secret) AS envelopeLength FROM agent_wallets WHERE agent_id=?').get(agent.id);
 const expected={owner,agentId:agent.id,mint:r.mint,network:r.network,signature:r.signature,executionId:r.executionId};
 if(!binding||!wallet||!address(wallet.address)||wallet.envelopeLength<1)return unavailable('WALLET_PROVISIONING_REQUIRED');
 if(binding.owner!==owner||binding.agent_id!==agent.id||binding.mint!==r.mint||binding.network!==r.network||binding.signature!==r.signature||binding.execution_id!==r.executionId||binding.wallet!==wallet.address||agent.tradingWallet!==wallet.address||Object.keys(expected).some(k=>agent.launchWalletBinding?.[k]!==expected[k]))return unavailable('BINDING_MISMATCH');
 if(!table(db,'real_reserved_accounts'))return unavailable('RESERVATIONS_UNAVAILABLE');
 let reserved;try{reserved=db.prepare('SELECT lamports FROM real_reserved_accounts WHERE wallet=?').all(wallet.address).reduce((sum,row)=>sum+uint(row.lamports),0n).toString();}catch{return unavailable('RESERVATIONS_UNAVAILABLE');}
 return {available:true,launched:true,wallet:wallet.address,reservedLamports:reserved,launch:{confirmed:true,mint:r.mint,signature:r.signature,confirmedSlot:r.confirmedSlot,executionId:r.executionId,provenance:r.pumpProvenance}};
}

const protection=()=>String(uint(DEFAULT_RISK_POLICY.minReserveLamports)+uint(DEFAULT_RISK_POLICY.futureSellFeeLamports)+uint(DEFAULT_RISK_POLICY.reconciliationMarginLamports));

export async function readAgentSetup({db,agent,owner,evidence,balanceReader,revalidate}){
 const base={version:1,agentId:agent.id,owner,network:'solana:101',authorizationGranted:false,funding:{enabled:false,ownerApprovalRequired:true},activation:{enabled:false,authorizationRequired:true,reason:'PUMP_EXECUTION_NOT_QUALIFIED'},trading:{enabled:false,mode:'REAL'}};
 const facts=readAgentSetupFacts({db,agent,owner,evidence});
 const fail=reason=>({...base,state:'RECONCILIATION_REQUIRED',reason,launch:null,wallet:null,capital:null,nextAction:{kind:'REVIEW_STATUS',enabled:false}});
 if(!facts.available)return fail(facts.reason);
 if(!facts.launched)return {...base,state:'LAUNCH_REQUIRED',launch:null,wallet:null,capital:null,nextAction:{kind:'REVIEW_LAUNCH',enabled:false}};
 let balance=null;
 try{const result=await balanceReader(facts.wallet);if(result?.owner===facts.wallet&&result.network==='solana:101'&&Number.isSafeInteger(result.lamports)&&result.lamports>=0&&Number.isSafeInteger(result.slot)&&Number.isSafeInteger(result.checkedAt))balance=result;}catch{/* A failed RPC is unavailable, never zero. */}
 const latest=await revalidate();
 if(!latest||latest.owner!==owner)throw Object.assign(Error('Owner session changed'),{status:401});
 const current=readAgentSetupFacts({db,agent:latest.agent,owner,evidence:latest.evidence});
 if(JSON.stringify(current)!==JSON.stringify(facts))return fail('SETUP_CHANGED');
 const reserve=protection(),remaining=balance?BigInt(balance.lamports)-uint(reserve)-uint(facts.reservedLamports):null;
 return {...base,state:!balance?'BALANCE_UNAVAILABLE':remaining<=0n?'AWAITING_FUNDING':'AWAITING_ACTIVATION',launch:facts.launch,
  wallet:{address:facts.wallet,recordStatus:'ENCRYPTED_RECORD_PRESENT',balanceStatus:balance?'AVAILABLE':'UNAVAILABLE',balanceLamports:balance?String(balance.lamports):null,slot:balance?.slot??null,observedAt:balance?.checkedAt??null,commitment:'confirmed'},
  capital:{protectedReserveLamports:reserve,reservedLamports:facts.reservedLamports,balanceAfterReserveLamports:remaining===null?null:String(remaining>0n?remaining:0n),executableTradeBudgetLamports:null,reason:'PUMP_EXECUTION_NOT_QUALIFIED',policySource:'controlled-policy-v1'},
  nextAction:{kind:remaining!==null&&remaining>0n?'REVIEW_ACTIVATION':'FUND_AGENT',enabled:false}};
}

export function createLaunchpadFundingAuthority({db,readScope,readEvidence}){
 return agent=>{
  const deny=()=>{throw Object.assign(Error('Confirmed launch and Agent wallet binding are required for funding'),{status:409});};
  const scope=readScope(agent);if(scope?.available!==true)deny();
  const hasBinding=table(db,'launch_agent_bindings')&&db.prepare('SELECT 1 FROM launch_agent_bindings WHERE agent_id=?').get(agent.id);
  if(scope.scoped===false&&!agent.launchWalletBinding&&!hasBinding)return {kind:'GENERAL'};
  const facts=readAgentSetupFacts({db,agent,owner:agent.creator,evidence:readEvidence(agent)});
  if(!facts.available||facts.launched!==true)deny();
  return {kind:'LAUNCHPAD',owner:agent.creator,agentId:agent.id,wallet:facts.wallet,mint:facts.launch.mint,network:'solana:101',executionId:facts.launch.executionId,signature:facts.launch.signature,confirmedSlot:facts.launch.confirmedSlot};
 };
}
