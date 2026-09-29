// Current external market facts are indicative; pool execution proof is RPC-only.
import 'dotenv/config';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {createMarketFeed} from '../server/market-data.js';
import {strategyIntent} from '../server/paper-engine.js';
import {resolveMarketProvenance,marketIdentity} from '../server/dex/market-provenance.js';
import {createRealMoneyNetwork} from '../server/real-money-network.js';
import {loadFreshCpmmPolicy} from '../server/dex/cpmm-mainnet-state.js';
import {SOL_MINT} from '../server/dex/intent.js';

const mint='Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk',pool='Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp';
if(process.env.LIVE_AUTONOMOUS_ENABLED==='true'||process.env.CONTROLLED_REAL_ENABLED==='true'||process.env.AUTONOMOUS_KILL_SWITCH==='false'||process.env.REAL_MONEY_EMERGENCY_STOP==='false')throw Error('READ_ONLY_FLAGS_REQUIRED');
const db=new DatabaseSync(resolve(process.env.DATA_DIR||'server/data/mainnet-safety','tekkwork.sqlite'),{readOnly:true});
const agent=JSON.parse(db.prepare('SELECT data FROM agents WHERE id=?').get('0f406135-35ea-437d-a27c-29052d279c3b').data);
const wallet=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get('0f406135-35ea-437d-a27c-29052d279c3b')?.address;db.close();
const net=createRealMoneyNetwork();await net.verify();
const feed=createMarketFeed({pairAddress:pool}),market=await feed(mint),decision=strategyIntent({...agent,agentId:'0f406135-35ea-437d-a27c-29052d279c3b',mint,position:null},market,Date.now());
let loaderReason=null,loaderMeta=null;
const provenance=await resolveMarketProvenance({snapshot:market,mint,agentWallet:wallet,connection:net.connection,verifyPool:async()=>{try{const verified=await loadFreshCpmmPolicy(net.connection,{mode:'LIVE_AUTONOMOUS',network:'solana:mainnet',direction:'BUY',agentWallet:wallet,inputMint:SOL_MINT,outputMint:mint,inputAmount:'100000',slippageBps:100,pool},{deferBuild:true});loaderMeta={pool:verified.pool,slot:verified.slot,genesis:verified.policy.snapshot.genesis,accountCount:verified.policy.snapshot.accounts.length};return verified;}catch(e){loaderReason=e.code??(/^[A-Z_]+$/.test(e.message)?e.message:'RPC_OR_LOADER_FAILURE');throw e;}}});
console.log(JSON.stringify({marketIdentity:marketIdentity(market),liquidityUsd:market.liquidityUsd,volume5m:market.volume5m,change5m:market.change5m,buys5m:market.buys5m,sells5m:market.sells5m,strategy:decision.strategy,result:decision.side,reason:decision.reason,signals:decision.signals,provenance:provenance.status,provenanceReason:provenance.reason,loaderReason,loaderMeta,verifiedPool:provenance.binding?.pool??null,verifiedSlot:provenance.binding?.verifiedSlot??null},null,2));
