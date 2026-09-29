import {readFileSync} from 'node:fs';
import {createDecipheriv} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Connection,VersionedTransaction} from '@solana/web3.js';
import {createCpmmProductionAdapter} from '../server/dex/cpmm-production-adapter.js';
import {FIRST_BUY,assertFirstBuyAcceptance} from '../server/dex/first-buy-acceptance.js';
import {buildVerifiedCpmmFromPolicy,cpmmReview,simulateUnsignedCpmm,CONTROLLED_USDC_MINT} from '../server/dex/cpmm-mainnet-state.js';
import {evaluateControlledRisk,DEFAULT_RISK_POLICY} from '../server/dex/intent.js';

const env=Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/).map(line=>line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2]]));
if(env.FUNDING_ENABLED!=='false'||env.WITHDRAWAL_ENABLED!=='false'||env.CONTROLLED_REAL_ENABLED!=='false'||env.LIVE_TRADING_ENABLED!=='false'||env.GLOBAL_TRADING_KILL_SWITCH!=='true'||env.REAL_MONEY_EMERGENCY_STOP==='false')throw Error('EXECUTION_FLAGS_NOT_CLOSED');
const db=new DatabaseSync('server/data/tekkwork.sqlite',{readOnly:true});
const vaultKey=env.VAULT_KEY_BASE64?Buffer.from(env.VAULT_KEY_BASE64,'base64'):readFileSync('server/data/vault.key');
const store={unseal:(encoded,context)=>{const bytes=Buffer.from(encoded,'base64'),cipher=createDecipheriv('aes-256-gcm',vaultKey,bytes.subarray(0,12));cipher.setAAD(Buffer.from(context));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]);}};
const connection=new Connection(env.MAINNET_RPC_URL||'https://api.mainnet-beta.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true});
try{
 const agent=db.prepare('SELECT owner,data FROM agents WHERE id=?').get(FIRST_BUY.agentId);
 if(!agent||agent.owner!==FIRST_BUY.owner||JSON.parse(agent.data).tradingWallet!==FIRST_BUY.agentWallet)throw Error('AGENT_IDENTITY_MISMATCH');
 const prior=db.prepare('SELECT data FROM dex_executions WHERE agent_id=?').all(FIRST_BUY.agentId).map(r=>JSON.parse(r.data));
 const body={direction:'BUY',inputMint:FIRST_BUY.inputMint,outputMint:FIRST_BUY.outputMint,inputAmount:FIRST_BUY.inputAmount,slippageBps:100,pool:FIRST_BUY.pool};
 assertFirstBuyAcceptance(body,{agentId:FIRST_BUY.agentId,owner:FIRST_BUY.owner,agentWallet:FIRST_BUY.agentWallet},{prior});
 const adapter=createCpmmProductionAdapter({connection,db,store});
 const intent={mode:'CONTROLLED_REAL',network:'solana:mainnet',version:1,agentId:FIRST_BUY.agentId,owner:FIRST_BUY.owner,agentWallet:FIRST_BUY.agentWallet,...body,createdAt:Date.now(),expiresAt:Date.now()+30000};
 await adapter.assertCustody(intent);
 const quote=await adapter.quote(intent);
 const pre=await adapter.reservePlan({intent,quote});
 if(pre.collected.transaction!==undefined)throw Error('FINAL_MESSAGE_BUILT_BEFORE_RISK');
 const capitalRisk=evaluateControlledRisk(intent,pre.snapshot,DEFAULT_RISK_POLICY);
 if(!capitalRisk.allowed)throw Error('CAPITAL_RISK_REJECTED');
 // Deliberately no ledger hold in this observational dry-run.
 const p=buildVerifiedCpmmFromPolicy(pre.collected);
 const usdc=p.policy.snapshot.accounts.find(a=>a.address===CONTROLLED_USDC_MINT);
 if(!usdc||Buffer.from(usdc.data,'base64')[44]!==6)throw Error('USDC_DECIMALS_UNVERIFIED');
 const message=VersionedTransaction.deserialize(Buffer.from(p.transaction,'base64')).message;
 const fee=(await connection.getFeeForMessage(message,'confirmed')).value;
 if(!Number.isSafeInteger(fee)||fee<0||fee>10000)throw Error('NETWORK_FEE_UNAVAILABLE');
 const snapshot={network:'solana:mainnet',agentWallet:FIRST_BUY.agentWallet,inputMint:intent.inputMint,outputMint:intent.outputMint,mintsVerified:true,tokenAccountsVerified:true,routeAvailable:true,solBalanceLamports:p.policy.agentBalanceLamports,networkFeeLamports:String(fee),ataRentLamports:p.context.rentCost.toString(),ataExists:p.context.rentCost===0n,inputTokenBalance:'0',observedAt:Date.now()};
 const risk=evaluateControlledRisk(intent,snapshot,DEFAULT_RISK_POLICY);
 const sim=await simulateUnsignedCpmm(connection,p);
 if(!sim.success)throw Error('UNSIGNED_SIMULATION_FAILED');
 const blockHeight=await connection.getBlockHeight('confirmed');
 if(blockHeight>p.lastValidBlockHeight)throw Error('BLOCKHASH_EXPIRED');
 const review=cpmmReview(p);
 console.log(JSON.stringify({readOnly:true,signerUsed:false,broadcast:false,vaultMapping:'VERIFIED',balanceLamports:review.agentBalanceLamports,inputLamports:review.inputAmount,expectedOutputBaseUnits:review.estimatedOutput,minimumOutputBaseUnits:review.minimumOutput,usdcDecimals:6,ataState:p.context.states.map(x=>x.exists),accountRentLamports:review.accountRentPeakLamports,networkFeeLamports:fee,networkFeeCapLamports:review.networkFeeCapLamports,protectedReserveLamports:review.totalProtectedLamports,expectedRemainingLamports:review.peakAvailableAfterLamports,risk:risk.allowed?'PASS':'FAIL',validator:review.validator,unexplainedWritable:review.unexplainedWritableAccounts,simulation:sim.success?'PASS':'FAIL',computeUnits:sim.unitsConsumed,messageHash:p.validation.messageHash,blockhash:p.policy.blockhash,lastValidBlockHeight:p.lastValidBlockHeight,currentBlockHeight:blockHeight,slot:p.slot}));
}finally{vaultKey.fill(0);db.close();}
