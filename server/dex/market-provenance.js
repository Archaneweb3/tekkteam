import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {SOL_MINT} from './intent.js';
import {CPMM} from './concrete-cpmm-proof.js';
import {loadFreshCpmmPolicy} from './cpmm-mainnet-state.js';

const TOKEN_PROGRAM='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const validAddress=value=>{try{return typeof value==='string'&&new PublicKey(value).toBase58()===value;}catch{return false;}};
const unsupported=(reason,retryDiagnostics)=>({status:'UNSUPPORTED_EXECUTION_VENUE',reason,binding:null,...(retryDiagnostics?{retryDiagnostics}:{})});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Provider identity is a hint, never authority. In particular, a token can
// have several markets, and a Raydium label does not prove a CPMM account.
export function marketIdentity(snapshot){
 return Object.freeze({network:snapshot?.network??null,analyzedMint:snapshot?.mint??null,baseMint:snapshot?.baseMint??snapshot?.mint??null,quoteMint:snapshot?.quoteMint??null,market:snapshot?.pair??null,reportedVenue:snapshot?.venue??null,source:snapshot?.source??null,snapshotId:snapshot?.snapshotId??null,observedAt:snapshot?.observedAt??null});
}

export function assertMarketBinding(binding,snapshot,intent){
 const identity=marketIdentity(snapshot),mint=intent.direction==='BUY'?intent.outputMint:intent.inputMint;
 if(!binding||binding.status!=='SUPPORTED_RAYDIUM_CPMM'||binding.identityHash!==hash(identity)||binding.identity?.snapshotId!==identity.snapshotId||identity.analyzedMint!==mint||!([identity.baseMint,identity.quoteMint].includes(mint)&&[identity.baseMint,identity.quoteMint].includes(SOL_MINT))||binding.pool!==intent.pool||binding.pool!==identity.market||binding.programId!==CPMM.toBase58()||binding.tokenPrograms?.base!==TOKEN_PROGRAM||binding.tokenPrograms?.quote!==TOKEN_PROGRAM)throw Object.assign(Error('MARKET_PROVENANCE_MISMATCH'),{code:'MARKET_PROVENANCE_MISMATCH'});
 return true;
}

export async function resolveMarketProvenance({snapshot,mint,agentWallet,connection,now=Date.now,verifyPool,preSignRetry=false}={}){
 const identity=marketIdentity(snapshot),time=now();
 if(!validAddress(mint)||identity.analyzedMint!==mint||snapshot?.tokenMint!==undefined&&snapshot.tokenMint!==mint)return unsupported('MINT_MISMATCH');
 if(identity.network!=='solana:101'||identity.source!=='Dexscreener')return unsupported('NETWORK_OR_SOURCE_MISMATCH');
 if(!Number.isSafeInteger(identity.observedAt)||identity.observedAt>time||time-identity.observedAt>30000||snapshot?.stale===true)return unsupported('STALE_MARKET_SNAPSHOT');
 if(!validAddress(identity.market)||!validAddress(identity.quoteMint)||!identity.snapshotId)return unsupported('INCOMPLETE_MARKET_IDENTITY');
 if(identity.reportedVenue!=='raydium')return unsupported('VENUE_MISMATCH');
 if(mint===SOL_MINT||!((identity.baseMint===mint&&identity.quoteMint===SOL_MINT)||(identity.baseMint===SOL_MINT&&identity.quoteMint===mint)))return unsupported('UNSUPPORTED_MARKET');
 if(!validAddress(agentWallet))return unsupported('AGENT_WALLET_UNAVAILABLE');
 try{
  const verified=verifyPool?await verifyPool({identity,mint,agentWallet}):await loadFreshCpmmPolicy(connection,{mode:preSignRetry?'AUTONOMOUS_ACCEPTANCE_TEST':undefined,network:'solana:mainnet',direction:'BUY',agentWallet,inputMint:SOL_MINT,outputMint:mint,inputAmount:'100000',slippageBps:100,pool:identity.market},{now,deferBuild:true,retryMinContextSlot:preSignRetry});
  const chainSnapshot=verified?.policy?.snapshot??verified?.snapshot;
  if(verified?.pool!==identity.market||!Number.isSafeInteger(verified.slot)||verified.slot<=0||chainSnapshot?.genesis!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')return unsupported('POOL_PROVENANCE_FAILED');
  const accounts=chainSnapshot.accounts??[],pool=accounts.find(a=>a.address===identity.market);
  if(pool?.owner!==CPMM.toBase58())return unsupported('POOL_PROGRAM_MISMATCH');
  const binding=Object.freeze({status:'SUPPORTED_RAYDIUM_CPMM',identity,identityHash:hash(identity),pool:identity.market,programId:CPMM.toBase58(),tokenPrograms:{base:TOKEN_PROGRAM,quote:TOKEN_PROGRAM},verifiedSlot:verified.slot,verifiedAt:time,snapshotSource:'FRESH_MAINNET_RPC',poolSnapshotHash:hash([chainSnapshot.genesis,verified.slot,accounts.map(a=>[a.address,a.owner,a.data])])});
  return {status:binding.status,reason:null,binding,retryDiagnostics:verified.retryDiagnostics??[]};
 }catch(e){return unsupported(e.code??'POOL_PROVENANCE_FAILED',e.retryDiagnostics);}
}
