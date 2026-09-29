// Synthetic market inputs, actual deterministic engine output; test-only, never production.
import {defaultStrategyConfig} from '../public/app/strategy-config.js';
import {strategyIntent,executePaper} from '../server/paper-engine.js';
import {decisionSnapshot} from '../server/market-radar.js';
const now=1800000000000;
const config=defaultStrategyConfig('momentum');config.risk.maxPositionPercent=.1;
const state={agentId:'radar-fixture',strategy:'momentum',strategyConfig:config,strategyConfigVersion:3,mode:'paper',enabled:true,mint:'So11111111111111111111111111111111111111112',cashUsd:15,realizedUsd:0,dailySpentSol:0};
const market={mint:state.mint,tokenSymbol:'FIXTURE',tokenName:'QA market — not a real opportunity',network:'solana:101',source:'Synthetic QA inputs',priceUsd:.00042,solUsd:150,liquidityUsd:42000,volume5m:2400,change5m:4.2,buys5m:20,sells5m:5,observedAt:now,snapshotId:'qa-market',timestampKind:'Test timestamp'};
const failedIntent=strategyIntent(state,{...market,change5m:0},now-60000),skipped=decisionSnapshot(state,failedIntent,null,now-60000);
const intent=strategyIntent(state,market,now),rejected=decisionSnapshot(state,intent,executePaper(state,intent,market,now),now);
config.risk.maxPositionPercent=10;state.strategyConfigVersion=4;
const buyIntent=strategyIntent(state,market,now+60000);market.observedAt=now+60000;buyIntent.marketSnapshot.observedAt=market.observedAt;
const buy=decisionSnapshot(state,buyIntent,executePaper(state,buyIntent,market,now+60000),now+60000);
console.log(JSON.stringify({agent:{id:state.agentId,name:'Nora · QA fixture',character:'cupsey'},radar:{agentId:state.agentId,mode:'paper',status:'WATCHING',strategy:'momentum',configVersion:3,opportunities:[rejected],scope:'Isolated QA: one configured market, no live opportunities'},decisions:[buy,rejected,skipped]}));
