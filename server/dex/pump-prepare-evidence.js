import {createHash} from 'node:crypto';
import {decodedPumpState,decodePumpVenueBundle} from './pump-account-decoder.js';
import {reject} from './intent.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields=['address','owner','slot','exists','executable','lamports'];
function encodeAccounts(accounts){
 if(!accounts||Object.keys(accounts).length>16)reject('PUMP_PREPARE_EVIDENCE_ACCOUNTS');
 return Object.fromEntries(Object.entries(accounts).map(([role,a])=>{
  if(!/^[a-zA-Z]{1,32}$/.test(role)||!a||!Buffer.isBuffer(a.data)||a.data.length>16384)reject('PUMP_PREPARE_EVIDENCE_ACCOUNTS');
  return [role,{...Object.fromEntries(fields.filter(k=>a[k]!==undefined).map(k=>[k,a[k]])),dataBase64:a.data.toString('base64')}];
 }));
}
function decodeAccounts(accounts){
 if(!accounts||Object.keys(accounts).length>16)reject('PUMP_PREPARE_EVIDENCE_ACCOUNTS');
 return Object.fromEntries(Object.entries(accounts).map(([role,a])=>{
  if(!/^[a-zA-Z]{1,32}$/.test(role)||!a||typeof a.dataBase64!=='string'||a.dataBase64.length>21848||Buffer.from(a.dataBase64,'base64').toString('base64')!==a.dataBase64||Object.keys(a).some(k=>![...fields,'dataBase64'].includes(k)))reject('PUMP_PREPARE_EVIDENCE_ACCOUNTS');
  const {dataBase64,...meta}=a;return [role,{...meta,data:Buffer.from(dataBase64,'base64')}];
 }));
}
export function preservePumpPreparation(options,source){
 const raw=decodedPumpState(options.venue).rawBundle;
 const body={version:1,source,intent:structuredClone(options.intent),executionWallet:options.executionWallet,blockhash:options.blockhash,networkFeeLamports:options.networkFeeLamports,feeCapLamports:options.feeCapLamports??'10000',rentCapLamports:options.rentCapLamports??'0',refundCapLamports:options.refundCapLamports??'0',nativeValidity:options.nativeValidity??null,rawBundle:{...raw,accounts:encodeAccounts(raw.accounts)},accounts:encodeAccounts(Object.fromEntries(['wallet','base',...(options.venue.kind==='PUMPSWAP'?['quote']:[])].map(k=>[k,options.accounts[k]]))),proofHash:options.venue.proofHash};
 const evidence={...body,evidenceHash:hash(body)};
 if(restorePumpPreparation(evidence,{source,now:options.now}).venue.proofHash!==options.venue.proofHash)reject('PUMP_PREPARE_EVIDENCE_PROOF');
 return evidence;
}
export function restorePumpPreparation(evidence,{source,now,intent}={}){
 if(!evidence||evidence.version!==1||evidence.source!==source)reject('PUMP_RUNTIME_PREPARE_OPTIONS_MISSING');
 const {evidenceHash,...body}=structuredClone(evidence);
 if(JSON.stringify(body).length>600000||hash(body)!==evidenceHash||intent&&hash(intent)!==hash(body.intent))reject('PUMP_PREPARE_EVIDENCE_BINDING');
 const venue=decodePumpVenueBundle({...body.rawBundle,accounts:decodeAccounts(body.rawBundle.accounts)});
 if(venue.source!==(source==='ON_CHAIN'?'BACKEND_RPC_READ':'LOCAL_FIXTURE')||venue.proofHash!==body.proofHash||body.executionWallet!==body.intent.agentWallet)reject('PUMP_PREPARE_EVIDENCE_PROOF');
 return {...body,venue,accounts:decodeAccounts(body.accounts),now};
}
