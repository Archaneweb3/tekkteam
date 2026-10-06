import test from 'node:test';
import assert from 'node:assert/strict';
import {AUTONOMOUS_V1,authorizeAutonomousV1,resolveAutonomousVenue,markRealPosition,decideRealExit} from '../server/dex/autonomous-v1.js';
import {SOL_MINT} from '../server/dex/intent.js';
import {CONTROLLED_CPMM_POOL,CONTROLLED_USDC_MINT} from '../server/dex/cpmm-mainnet-state.js';

const now=1_800_000_000_000;
const base=()=>({flags:{liveAutonomousEnabled:true,autonomousKillSwitch:false,realMoneyEmergencyStop:false},network:{network:'solana:mainnet',verified:true},agent:{mode:'LIVE_AUTONOMOUS',enabled:true,paused:false,vaultVerified:true,owner:'owner',agentId:'agent',agentWallet:'wallet'},intent:{mode:'LIVE_AUTONOMOUS',network:'solana:mainnet',agentId:'agent',owner:'owner',agentWallet:'wallet',direction:'BUY',inputMint:SOL_MINT,outputMint:CONTROLLED_USDC_MINT,inputAmount:'100000',slippageBps:100,pool:CONTROLLED_CPMM_POOL},market:{mint:CONTROLLED_USDC_MINT,observedAt:now-1000},ledger:{openPositions:0,unknown:false,unresolved:false,reservationConflict:false,consecutiveFailures:0,pausedByBreaker:false,cooldownUntil:0,dailyTurnoverLamports:'0',riskPass:true},now});
const blocked=(edit,code)=>{const x=base();edit(x);assert.throws(()=>authorizeAutonomousV1(x),e=>e.code===code);};

test('entry cooldown blocks BUY but cannot hold a protective full-position SELL',()=>{
 const x=base();x.ledger.cooldownUntil=now+1800000;
 assert.throws(()=>authorizeAutonomousV1(x),e=>e.code==='TRADE_COOLDOWN');
 x.intent={...x.intent,direction:'SELL',inputMint:CONTROLLED_USDC_MINT,outputMint:SOL_MINT,inputAmount:'12000'};
 x.ledger.openPositions=1;x.ledger.positionQuantity='12000';
 assert.equal(authorizeAutonomousV1(x).authorized,true);
 x.flags.autonomousKillSwitch=true;assert.throws(()=>authorizeAutonomousV1(x),e=>e.code==='AUTONOMOUS_TRADING_STOP');
});

test('only the exact proven classic-SPL pool and pair resolve',()=>{
 assert.equal(resolveAutonomousVenue({mint:CONTROLLED_USDC_MINT,pool:CONTROLLED_CPMM_POOL,direction:'BUY'}).kind,'RAYDIUM_CPMM');
 for(const [mint,pool] of [['PumpFunMint',CONTROLLED_CPMM_POOL],[CONTROLLED_USDC_MINT,'unproven-pool']])assert.throws(()=>resolveAutonomousVenue({mint,pool,direction:'BUY'}),e=>e.code==='UNSUPPORTED_EXECUTION_VENUE');
});
test('authorization is separate from browser capability and fail-closed by default',()=>{
 assert.equal(authorizeAutonomousV1(base()).authorized,true);
 blocked(x=>x.flags.liveAutonomousEnabled=false,'AUTONOMOUS_TRADING_STOP');
 blocked(x=>x.flags.autonomousKillSwitch=true,'AUTONOMOUS_TRADING_STOP');
 blocked(x=>x.flags.realMoneyEmergencyStop=true,'REAL_MONEY_EMERGENCY_STOP');
 blocked(x=>x.network.verified=false,'MAINNET_NOT_VERIFIED');
 blocked(x=>x.agent.vaultVerified=false,'VAULT_OR_OWNERSHIP_UNVERIFIED');
 blocked(x=>x.intent.agentWallet='other','AUTONOMOUS_INTENT_MISMATCH');
});
test('limits, stale signals, unresolved execution and circuit breaker deny entry',()=>{
 blocked(x=>x.intent.inputAmount='100001','TRADE_LIMIT');
 blocked(x=>x.intent.slippageBps=101,'SLIPPAGE_LIMIT');
 blocked(x=>x.market.observedAt=now-AUTONOMOUS_V1.maxSignalAgeMs-1,'STALE_SIGNAL');
 blocked(x=>x.ledger.openPositions=1,'POSITION_LIMIT');
 blocked(x=>x.ledger.unknown=true,'UNRESOLVED_EXECUTION');
 blocked(x=>x.ledger.reservationConflict=true,'RESERVATION_CONFLICT');
 blocked(x=>x.ledger.consecutiveFailures=3,'AUTONOMOUS_CIRCUIT_OPEN');
 blocked(x=>x.ledger.dailyTurnoverLamports='450001','DAILY_TURNOVER_LIMIT');
 blocked(x=>x.ledger.riskPass=false,'RISK_REJECTED');
});
test('confirmed position valuation is unavailable for stale or unverified quotes',()=>{
 const position={mint:CONTROLLED_USDC_MINT,pool:CONTROLLED_CPMM_POOL,quantity:'12000',costBasisLamports:'100000',openedAt:now-30000};
 const quote={verified:true,network:'solana:mainnet',direction:'SELL',inputMint:position.mint,outputMint:SOL_MINT,pool:position.pool,inputAmount:position.quantity,estimatedOutput:'120000',observedAt:now-1000};
 const mark=markRealPosition({position,quote,now});
 assert.deepEqual([mark.valueLamports,mark.unrealizedPnlLamports,mark.unrealizedPnlBps],['120000','20000','2000']);
 assert.equal(decideRealExit({position,valuation:mark,config:{stopLossBps:400,takeProfitBps:800,maxHoldMs:900000},now}).reason,'TAKE_PROFIT');
 assert.equal(markRealPosition({position,quote:{...quote,observedAt:now-10001},now}).available,false);
 assert.equal(markRealPosition({position,quote:{...quote,verified:false},now}).available,false);
 const loss=markRealPosition({position,quote:{...quote,estimatedOutput:'95000'},now});
 assert.equal(decideRealExit({position,valuation:loss,config:{stopLossBps:400,takeProfitBps:800,maxHoldMs:900000},now}).reason,'STOP_LOSS');
});
