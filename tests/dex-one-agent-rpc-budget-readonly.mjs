import 'dotenv/config';
import {Connection} from '@solana/web3.js';
import {createRealMoneyNetwork} from '../server/real-money-network.js';
import {observeRpcFetch} from '../server/dex/pre-sign-rpc-budget.js';
import {loadFreshCpmmPolicy} from '../server/dex/cpmm-mainnet-state.js';
import {ENGINE_ACCEPTANCE as C} from '../server/dex/autonomous-acceptance.js';
import {SOL_MINT} from '../server/dex/intent.js';

// RPC cadence only: no ledger, vault, signer, broadcaster or transaction build.
// SELL uses the same account-acquisition shape as BUY because this agent has no
// real open token position; this cannot prove SELL execution or market outcome.
const methodCounts={},results={};
const rawConnection=new Connection(process.env.MAINNET_RPC_URL,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:observeRpcFetch});
const connection=new Proxy(rawConnection,{get(target,property){const value=Reflect.get(target,property,target);if(typeof value!=='function')return value;return (...args)=>{if(/^get/.test(property))methodCounts[property]=(methodCounts[property]??0)+1;return value.apply(target,args);};}});
const network=createRealMoneyNetwork({connection});
const intent={mode:C.mode,network:'solana:mainnet',agentWallet:C.agentWallet,direction:'BUY',inputMint:SOL_MINT,outputMint:C.tokenMint,inputAmount:C.maxBuyLamports,slippageBps:C.maxSlippageBps,pool:C.pool};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const acquire=async(count,{firstGuarded=true}={})=>{const result={attempted:count,success:0,rateLimited:0,minContext:0,other:0,otherCodes:{}};for(let n=0;n<count;n++){try{if(firstGuarded||n>0)await network.verify();await loadFreshCpmmPolicy(connection,intent,{deferBuild:true,retryMinContextSlot:true});result.success++;}catch(e){if(e.code==='RPC_RATE_LIMITED'||/\b429\b/.test(String(e.message)))result.rateLimited++;else if(e.code==='RPC_MIN_CONTEXT_SLOT_NOT_REACHED')result.minContext++;else{result.other++;const code=/^[A-Z_]+$/.test(e.code??'')?e.code:'UNCLASSIFIED';result.otherCodes[code]=(result.otherCodes[code]??0)+1;}}}return result;};
try{
 const status=await network.verify();
 results.network=status.networkConsistent===true?'MAINNET_VERIFIED':'FAIL';
 results.buyPreSign=await acquire(5,{firstGuarded:false}); // provenance, Risk quote/plan, execution quote/plan
 await wait(15000); // actual one-agent scheduler cadence
 results.positionMonitoring=await acquire(1); // account-read shape, not a synthetic position
 results.sellPreSignEquivalent=await acquire(4); // Risk quote/plan, execution quote/plan
}catch{results.network='FAIL';}
console.log(JSON.stringify({network:results.network,cadenceMs:15000,peakReadConcurrency:1,methodCounts,phases:{buyPreSign:results.buyPreSign,positionMonitoring:results.positionMonitoring,sellPreSignEquivalent:results.sellPreSignEquivalent}},null,2));
