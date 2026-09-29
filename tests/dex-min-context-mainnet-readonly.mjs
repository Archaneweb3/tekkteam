import 'dotenv/config';
import {Connection} from '@solana/web3.js';
import {loadFreshCpmmPolicy,MIN_CONTEXT_RETRY} from '../server/dex/cpmm-mainnet-state.js';
import {ENGINE_ACCEPTANCE as C} from '../server/dex/autonomous-acceptance.js';
import {SOL_MINT} from '../server/dex/intent.js';

// Read-only production state acquisition. No ledger, vault, signer, or sender
// is imported here; the RPC URL is intentionally never printed.
const rpc=new Connection(process.env.MAINNET_RPC_URL||'https://api.mainnet-beta.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true});
const intent={mode:C.mode,network:'solana:mainnet',agentWallet:C.agentWallet,direction:'BUY',inputMint:SOL_MINT,outputMint:C.tokenMint,inputAmount:C.maxBuyLamports,slippageBps:C.maxSlippageBps,pool:C.pool};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stats={paced:{attempted:0,successful:0,minContextEvents:0,recovered:0,cleanFailures:0,rateLimited:0,otherFailures:0},rapid:{attempted:0,successful:0,minContextEvents:0,recovered:0,cleanFailures:0,rateLimited:0,otherFailures:0}};
for(const mode of ['paced','rapid']){
 const s=stats[mode];
 while(s.successful<10&&s.attempted<20){
  if(mode==='paced'&&s.attempted)await wait(150);
  s.attempted++;
  try{
   const p=await loadFreshCpmmPolicy(rpc,intent,{deferBuild:true,retryMinContextSlot:true});
   const events=p.retryDiagnostics.filter(a=>a.rpcErrorCode===-32016||a.rpcErrorCode==='STALE_POOL_SNAPSHOT').length;
   s.minContextEvents+=events;s.recovered+=Number(events>0);s.successful++;
   if(p.snapshotDiagnostic.dependentFetchContextSlot<p.snapshotDiagnostic.minContextSlot)throw Error('SLOT_FENCE_BROKEN');
  }catch(e){
   s.minContextEvents+=(e.retryDiagnostics??[]).filter(a=>a.rpcErrorCode===-32016||a.rpcErrorCode==='STALE_POOL_SNAPSHOT').length;
   if(['RPC_MIN_CONTEXT_SLOT_NOT_REACHED','STALE_POOL_SNAPSHOT','RPC_STATE_ACQUISITION_TIMEOUT'].includes(e.code))s.cleanFailures++;
   else if(/429|rate limit|too many requests/i.test(String(e.message??'')))s.rateLimited++;
   else s.otherFailures++;
  }
 }
}
console.log(JSON.stringify({network:'solana:mainnet',maxAttempts:MIN_CONTEXT_RETRY.maxAttempts,backoffMs:MIN_CONTEXT_RETRY.backoffMs,maxWindowMs:MIN_CONTEXT_RETRY.maxWindowMs,stats},null,2));
