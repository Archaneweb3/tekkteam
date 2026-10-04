// Destination-only migration policy. No source database or RPC side effects.
import {backendNetwork,NETWORKS} from '../src/networks.js';

export const DESTINATION_SCHEMA_VERSION=2;
export const DESTINATION_AGENTS_SQL=`CREATE TABLE agents (
 no INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT UNIQUE NOT NULL,
 owner TEXT NOT NULL,
 data TEXT NOT NULL,
 secret TEXT NULL
)`;

export function destinationNetwork(){
 const selected=backendNetwork({SOLANA_NETWORK:'MAINNET',MAINNET_SAFETY_MODE:'true'});
 if(selected.network!=='mainnet'||!selected.safetyMode)throw Error('DESTINATION_NETWORK_INVALID');
 return 'MAINNET';
}

export function projectAgentIdentity(agent,owner,{custodyAddress=null}={}){
 if(!agent||typeof agent.id!=='string'||!agent.id||typeof owner!=='string'||agent.creator!==owner)throw Error('AGENT_OWNER_MISMATCH');
 if(custodyAddress!==null&&(typeof custodyAddress!=='string'||agent.tradingWallet!==custodyAddress))throw Error('CUSTODY_ASSOCIATION_MISMATCH');
 const {id,creator,name,character,avatarSeed,strategy,description,createdAt}=agent;
 return {id,creator,name,character,avatarSeed,strategy,description,createdAt,
  network:'mainnet',status:'DRAFT',coin:null,launch:null,
  ...(custodyAddress?{tradingWallet:custodyAddress}:{}),migrationOrigin:'IDENTITY_ONLY'};
}

export function projectPaperRecord(record,{state=false}={}){
 if(!record||record.mode!==undefined&&String(record.mode).toLowerCase()!=='paper')throw Error('NON_PAPER_RECORD');
 return {...record,mode:'paper',...(state?{enabled:false}:{}),migrationOrigin:'PAPER'};
}

export function classifyMainnetProof({signature,genesis,status,transaction,effectProven=false}={}){
 if(!signature)return 'INSUFFICIENT_EVIDENCE';
 if(genesis!==NETWORKS.MAINNET.genesis)return 'INSUFFICIENT_EVIDENCE';
 if(status===null&&transaction===null)return 'NOT_FOUND';
 if(!transaction||transaction.signature!==signature||transaction.finality!=='finalized')return 'INSUFFICIENT_EVIDENCE';
 if(transaction.error!==null&&transaction.error!==undefined)return 'MAINNET_PROVEN_FAILURE';
 return effectProven?'MAINNET_PROVEN_SUCCESS':'INSUFFICIENT_EVIDENCE';
}

export function eligibleRealMoneyHistory(classification){
 return classification==='MAINNET_PROVEN_SUCCESS'||classification==='MAINNET_PROVEN_FAILURE';
}

export function walletTransferEffect(record,transaction){
 if(!transaction||transaction.meta?.err!==null||Number(transaction.meta.fee)!==Number(record.feeLamports))return false;
 const instructions=[...(transaction.transaction?.message?.instructions??[]),
  ...(transaction.meta.innerInstructions??[]).flatMap(group=>group.instructions??[])];
 return instructions.some(instruction=>instruction.program==='system'&&instruction.parsed?.type==='transfer'&&
  instruction.parsed.info?.source===record.source&&instruction.parsed.info?.destination===record.destination&&
  Number(instruction.parsed.info?.lamports)===Number(record.amountLamports));
}
