// Explicit read-only diagnostic. No ledger, vault, signer, reservation or send.
import 'dotenv/config';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {createMarketFeed,createPairMarketFeed} from '../server/market-data.js';
import {createMarketDiscovery,candidateQueue} from '../server/market-discovery.js';
import {strategyIntent} from '../server/paper-engine.js';
import {resolveMarketProvenance} from '../server/dex/market-provenance.js';
import {CONTROLLED_CPMM_POOL,CONTROLLED_USDC_MINT,loadFreshCpmmPolicy} from '../server/dex/cpmm-mainnet-state.js';
import {SOL_MINT} from '../server/dex/intent.js';
import {createRealMoneyNetwork} from '../server/real-money-network.js';

if(process.env.FUNDING_ENABLED==='true'||process.env.WITHDRAWAL_ENABLED==='true'||process.env.LIVE_TRADING_ENABLED==='true'||process.env.LIVE_AUTONOMOUS_ENABLED==='true'||process.env.CONTROLLED_REAL_ENABLED==='true'||process.env.AUTONOMOUS_KILL_SWITCH==='false'||process.env.REAL_MONEY_EMERGENCY_STOP==='false')throw Error('READ_ONLY_FLAGS_REQUIRED');
const agentId='0f406135-35ea-437d-a27c-29052d279c3b';
const db=new DatabaseSync(resolve(process.env.DATA_DIR||'server/data/mainnet-safety','tekkwork.sqlite'),{readOnly:true});
const row=db.prepare('SELECT owner,data FROM agents WHERE id=?').get(agentId),wallet=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get(agentId);
db.close();
if(!row||!wallet)throw Error('AGENT_CONTEXT_UNAVAILABLE');
const agent={...JSON.parse(row.data),agentId,owner:row.owner,agentWallet:wallet.address};
const realMoney=createRealMoneyNetwork();await realMoney.verify();const connection=realMoney.connection;
const now=Date.now,provenance=async q=>resolveMarketProvenance({snapshot:q,mint:q.mint,agentWallet:wallet.address,connection,now});
const discovery=createMarketDiscovery({market:createMarketFeed({now}),now});
const scan=await discovery.scan(),queue=candidateQueue(agent,scan,now()),buySignals=[];
for(const candidate of queue.rows.filter(c=>c.eligible)){
 const signal=strategyIntent({...agent,mint:candidate.mint,position:null},candidate.quote,now());
 if(signal.side!=='BUY')continue;
 const result=await provenance(candidate.quote);
 buySignals.push({token:candidate.quote.tokenSymbol,mint:candidate.mint,discoveryPair:candidate.quote.pair,reportedVenue:candidate.quote.venue,resolvedExecutionVenue:result.binding?.status??null,verifiedPool:result.binding?.pool??null,provenance:result.status,reason:result.reason});
}
const knownFeed=createPairMarketFeed({now}),known=await knownFeed({mint:CONTROLLED_USDC_MINT,pair:CONTROLLED_CPMM_POOL});
const knownResult=await provenance(known);
let poolDiagnostic=null;if(knownResult.status!=='SUPPORTED_RAYDIUM_CPMM')try{const checked=await loadFreshCpmmPolicy(connection,{network:'solana:mainnet',direction:'BUY',agentWallet:wallet.address,inputMint:SOL_MINT,outputMint:CONTROLLED_USDC_MINT,inputAmount:'100000',slippageBps:100,pool:CONTROLLED_CPMM_POOL},{now,deferBuild:true});poolDiagnostic={slot:checked.slot,poolMatch:checked.pool===known.pair,genesis:checked.snapshot.genesis,poolOwner:checked.snapshot.accounts.find(a=>a.address===known.pair)?.owner};}catch(e){const message=String(e.message);poolDiagnostic=e.code??(message.match(/^[A-Z_]+$/)?.[0]??(/429|rate.limit/i.test(message)?'RPC_RATE_LIMITED':/403|unauthorized/i.test(message)?'RPC_ACCESS_DENIED':/timeout/i.test(message)?'RPC_TIMEOUT':/minimum.context.slot/i.test(message)?'RPC_CONTEXT_SLOT_UNAVAILABLE':'READ_ONLY_RPC_FAILURE'));}
const knownProblem=[known.volume5m,known.change5m,known.buys5m,known.sells5m].every(Number.isFinite)?null:'INCOMPLETE_STRATEGY_SIGNAL';
const knownSignal=knownProblem?{side:'HOLD',reason:knownProblem}:strategyIntent({...agent,mint:known.mint,position:null},known,now());
console.log(JSON.stringify({discovery:{status:scan.status,scanned:queue.scanned,eligible:queue.eligible,buySignals,supported:buySignals.filter(x=>x.provenance==='SUPPORTED_RAYDIUM_CPMM').length,unsupported:buySignals.filter(x=>x.provenance!=='SUPPORTED_RAYDIUM_CPMM').length},known:{market:known.pair,baseMint:known.baseMint,quoteMint:known.quoteMint,venue:knownResult.status,provenanceReason:knownResult.reason,poolDiagnostic,verifiedPool:knownResult.binding?.pool??null,strategy:knownSignal.side,risk:knownSignal.side==='BUY'?'NOT_EVALUATED_READ_ONLY':'NOT_APPLICABLE',wouldAction:knownSignal.side==='BUY'?'WOULD_BUY_AFTER_RISK':'SKIP',reason:knownSignal.reason,liquidityUsd:known.liquidityUsd,volume5m:known.volume5m}},null,2));
