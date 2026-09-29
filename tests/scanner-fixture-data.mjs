import {Keypair} from '@solana/web3.js';
import {evaluateScan} from '../server/opportunity-scanner.js';
import {radarState} from '../server/market-radar.js';
import {defaultStrategyConfig} from '../public/app/strategy-config.js';
const time=Date.now(),agent={id:'scanner-fixture',name:'Scanner QA',characterId:'frank',strategy:'balanced'};
const s={agentId:agent.id,mode:'paper',discoveryMode:true,enabled:true,everStarted:true,strategy:'balanced',strategyConfig:defaultStrategyConfig(),strategyConfigVersion:2,initialSol:.1,cashSol:.1,realizedSol:0,cashUsd:15,initialUsd:15,realizedUsd:0,dailySpentSol:0};
const candidates=Array.from({length:6},(_,i)=>{const mint=Keypair.generate().publicKey.toBase58();return {mint,quote:{mint,network:'solana:101',tokenName:'Fixture market '+(i+1),tokenSymbol:'QA'+(i+1),source:'Synthetic QA inputs',priceUsd:.01,solUsd:150,liquidityUsd:50000-i*1000,volume5m:i===5?100:2000,change5m:i%2===0?2:.2,buys5m:20,sells5m:5,observedAt:time,timestampKind:'Synthetic test timestamp'}};});
const decisions=[];evaluateScan(s,{universe:{status:'OK',candidates,discoveredAt:time},held:null},time,{capture:(s,d)=>{decisions.push(d);return true;},event:()=>{}});
console.log(JSON.stringify({agent,radar:radarState(agent,s,time),decisions},null,2));
