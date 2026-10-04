import {createHash} from 'node:crypto';
import {decodedPumpState} from './pump-account-decoder.js';
import {buildOfflinePumpInstruction} from './pump-offline-instruction.js';
import {inspectOfflinePumpWalletAccounts} from './pump-wallet-accounts.js';
import {rejectPump} from './pump-sdk-boundary.js';
import {qualifyOfflinePumpAuxiliary} from './pump-auxiliary-layout.js';

// Completeness report only: unknown auxiliary layouts never become execution evidence.
export async function inspectOfflinePumpAccountInventory(options={}){
 options={...options,intent:Object.freeze({...options.intent}),walletAccounts:Object.fromEntries(Object.entries(options.walletAccounts??{}).map(([role,a])=>[role,{...a,data:Buffer.isBuffer(a.data)?Buffer.from(a.data):a.data}]))};
 const s=decodedPumpState(options.venue);
 if(options.venue.source!=='LOCAL_FIXTURE')rejectPump('PUMP_INVENTORY_FIXTURE_ONLY');
 const snapshots=options.instructionAccounts;
 if(!Array.isArray(snapshots)||snapshots.length>64)rejectPump('PUMP_INVENTORY_INVALID');
 const raw=new Map();
 for(const a of snapshots){
  if(!a||typeof a.address!=='string'||raw.has(a.address)||a.slot!==options.venue.slot||typeof a.exists!=='boolean'||a.exists&&(!Buffer.isBuffer(a.data)||a.data.length>16384||typeof a.owner!=='string'||typeof a.executable!=='boolean'))rejectPump('PUMP_INVENTORY_ACCOUNT_INVALID');
  raw.set(a.address,a.exists?{...a,data:Buffer.from(a.data)}:{...a});
 }
 inspectOfflinePumpWalletAccounts({...options,accounts:options.walletAccounts});
 const built=await buildOfflinePumpInstruction(options),metas=new Map();
 for(const meta of built.instruction.keys){const address=meta.pubkey.toBase58(),current=metas.get(address)??{isSigner:false,isWritable:false};metas.set(address,{isSigner:current.isSigner||meta.isSigner,isWritable:current.isWritable||meta.isWritable});}
 if([...raw.keys()].some(address=>!metas.has(address)))rejectPump('PUMP_INVENTORY_UNRELATED_ACCOUNT');
 const trusted=new Map(Object.values(s.copied).map(a=>[a.address,a.info]));
 for(const role of ['wallet','base','quote']){const a=options.walletAccounts?.[role];if(a&&(role!=='quote'||options.venue.kind==='PUMPSWAP'))trusted.set(a.address,{data:Buffer.from(a.data),owner:{toBase58:()=>a.owner},executable:a.executable});}
 const roles=new Map(built.accountRoles.map(a=>[a.role,a.address])),rows=[];
 for(const {role,address} of built.accountRoles){
  const privileges=metas.get(address),a=raw.get(address),proof=trusted.get(address);
  let status='MISSING_REQUIRES_READ',reason='Account snapshot absent; no provisioning authorized';
  if(a?.exists===false){if(proof)rejectPump('PUMP_INVENTORY_PROOF_MISMATCH');status='MISSING_REQUIRES_PROVISIONING';reason='Explicit local fixture absence; not created';}
  else if(a){
   if(proof&&(a.owner!==proof.owner.toBase58()||a.executable!==proof.executable||!a.data.equals(proof.data)))rejectPump('PUMP_INVENTORY_PROOF_MISMATCH');
   const qualified=proof||await qualifyOfflinePumpAuxiliary({role,raw:a,venue:options.venue,state:s,roles,executionWallet:options.executionWallet});
   status=qualified?'VERIFIED_LOCAL_LAYOUT':'UNSUPPORTED_LAYOUT';reason=qualified?'Matches qualified local decoder or auxiliary layout':'Auxiliary account owner/layout not qualified';
  }
  rows.push(Object.freeze({role,address,...privileges,status,reason,dataHash:a?.exists?createHash('sha256').update(a.data).digest('hex'):null}));
 }
 return Object.freeze({schema:'PUMP_OFFLINE_ACCOUNT_INVENTORY_V1',rows:Object.freeze(rows),provenance:'DERIVED',source:'LOCAL_FIXTURE',allAccountsQualified:rows.every(r=>r.status==='VERIFIED_LOCAL_LAYOUT'),executable:false,authorizationGranted:false,notSigned:true,notBroadcast:true});
}
