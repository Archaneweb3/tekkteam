import {PublicKey} from '@solana/web3.js';
import {SOL_MINT,integer,reject} from './intent.js';

// This is a policy boundary, not an executor. A venue is executable only if
// its exact pool and token pair are supported by the production adapter.
export const AUTONOMOUS_V1=Object.freeze({maxOpenPositions:1,maxBuyLamports:'100000',maxSlippageBps:100,maxDailyTurnoverLamports:'500000',maxConsecutiveFailures:3,maxSignalAgeMs:30000,maxPriceAgeMs:10000});
export const PUMPSWAP_DISABLED=Object.freeze({kind:'PUMPSWAP',enabled:false});

export function resolveAutonomousVenue({mint,direction,pool}){
 try{
  if(!['BUY','SELL'].includes(direction)||mint===SOL_MINT||new PublicKey(mint).toBase58()!==mint||new PublicKey(pool).toBase58()!==pool)reject('UNSUPPORTED_EXECUTION_VENUE');
  // This descriptor is only an identity hint. The production loader must
  // independently prove CPMM ownership, PDAs, classic mints and WSOL pairing.
  return Object.freeze({kind:'RAYDIUM_CPMM',pool,tokenMint:mint});
 }catch{reject('UNSUPPORTED_EXECUTION_VENUE');}
}

export function authorizeAutonomousV1({flags,network,agent,intent,market,ledger,now=Date.now()}){
 if(flags?.liveAutonomousEnabled!==true||flags?.autonomousKillSwitch!==false)reject('AUTONOMOUS_TRADING_STOP');
 if(flags?.realMoneyEmergencyStop!==false)reject('REAL_MONEY_EMERGENCY_STOP');
 if(network?.network!=='solana:mainnet'||network?.verified!==true)reject('MAINNET_NOT_VERIFIED');
 if(agent?.mode!=='LIVE_AUTONOMOUS'||agent?.enabled!==true||agent?.paused===true)reject('AGENT_NOT_LIVE');
 if(agent?.vaultVerified!==true||!agent.owner||!agent.agentId||!agent.agentWallet)reject('VAULT_OR_OWNERSHIP_UNVERIFIED');
 if(intent?.mode!=='LIVE_AUTONOMOUS'||intent?.agentId!==agent.agentId||intent?.owner!==agent.owner||intent?.agentWallet!==agent.agentWallet||intent?.network!=='solana:mainnet')reject('AUTONOMOUS_INTENT_MISMATCH');
 if(intent.direction!=='BUY'&&intent.direction!=='SELL')reject('INVALID_DIRECTION');
 const mint=intent.direction==='BUY'?intent.outputMint:intent.inputMint;
 if(intent.inputMint!==(intent.direction==='BUY'?SOL_MINT:mint)||intent.outputMint!==(intent.direction==='BUY'?mint:SOL_MINT))reject('UNSUPPORTED_PAIR');
 const venue=resolveAutonomousVenue({mint,direction:intent.direction,pool:intent.pool});
 if(!Number.isSafeInteger(intent.slippageBps)||intent.slippageBps<0||intent.slippageBps>AUTONOMOUS_V1.maxSlippageBps)reject('SLIPPAGE_LIMIT');
 const amount=integer(intent.inputAmount);
 if(intent.direction==='BUY'&&amount>BigInt(AUTONOMOUS_V1.maxBuyLamports))reject('TRADE_LIMIT');
 if(!Number.isSafeInteger(market?.observedAt)||market.observedAt>now||now-market.observedAt>AUTONOMOUS_V1.maxSignalAgeMs||market.mint!==mint)reject('STALE_SIGNAL');
 if(ledger?.unknown===true||ledger?.unresolved===true)reject('UNRESOLVED_EXECUTION');
 if(ledger?.reservationConflict===true)reject('RESERVATION_CONFLICT');
 if(!Number.isSafeInteger(ledger?.openPositions)||ledger.openPositions<0||ledger.openPositions>AUTONOMOUS_V1.maxOpenPositions)reject('POSITION_STATE_INVALID');
 if(intent.direction==='BUY'&&ledger.openPositions!==0||intent.direction==='SELL'&&ledger.openPositions!==1)reject('POSITION_LIMIT');
 if(!Number.isSafeInteger(ledger?.consecutiveFailures)||ledger.consecutiveFailures<0||ledger.consecutiveFailures>=AUTONOMOUS_V1.maxConsecutiveFailures)reject('AUTONOMOUS_CIRCUIT_OPEN');
 if(ledger?.pausedByBreaker===true)reject('AUTONOMOUS_CIRCUIT_OPEN');
 if(!Number.isSafeInteger(ledger?.cooldownUntil)||ledger.cooldownUntil>now)reject('TRADE_COOLDOWN');
 const spent=integer(ledger.dailyTurnoverLamports,{zero:true});
 if(spent+(intent.direction==='BUY'?amount:0n)>BigInt(AUTONOMOUS_V1.maxDailyTurnoverLamports))reject('DAILY_TURNOVER_LIMIT');
 if(intent.direction==='SELL'&&integer(ledger.positionQuantity,{zero:true})!==amount)reject('SELL_MUST_CLOSE_POSITION');
 if(ledger?.riskPass!==true)reject('RISK_REJECTED');
 return Object.freeze({authorized:true,venue,checkedAt:now});
}

// Only a fresh, locally verified SELL quote can value a real position in SOL.
// Quoted value is NEVER used as an actual fill or realized PnL.
export function markRealPosition({position,quote,now=Date.now()}){
 if(!position||integer(position.quantity,{zero:true})===0n)return {available:false,reason:'NO_OPEN_POSITION'};
 if(quote?.verified!==true||quote?.network!=='solana:mainnet'||quote?.direction!=='SELL'||quote?.inputMint!==position.mint||quote?.outputMint!==SOL_MINT||quote?.pool!==position.pool||quote?.inputAmount!==position.quantity||!Number.isSafeInteger(quote.observedAt)||quote.observedAt>now||now-quote.observedAt>AUTONOMOUS_V1.maxPriceAgeMs)return {available:false,reason:'STALE_OR_UNVERIFIED_PRICE'};
 const value=integer(quote.estimatedOutput,{zero:true}),basis=integer(position.costBasisLamports,{zero:true});
 if(!basis)return {available:false,reason:'COST_BASIS_UNAVAILABLE'};
 const pnl=value-basis;
 const quantity=integer(position.quantity);
 return {available:true,valueLamports:value.toString(),unrealizedPnlLamports:pnl.toString(),unrealizedPnlBps:(pnl*10000n/basis).toString(),currentPriceLamportsPerToken:(value*1000000n/quantity).toString(),entryCostLamportsPerToken:(basis*1000000n/quantity).toString(),observedAt:quote.observedAt};
}

export function decideRealExit({position,valuation,config,now=Date.now()}){
 if(!valuation?.available)return {action:'HOLD',reason:valuation?.reason??'PRICE_UNAVAILABLE'};
 if(!Number.isSafeInteger(position?.openedAt)||!Number.isSafeInteger(config?.stopLossBps)||!Number.isSafeInteger(config?.takeProfitBps)||!Number.isSafeInteger(config?.maxHoldMs)||config.stopLossBps<0||config.takeProfitBps<0||config.maxHoldMs<=0)reject('EXIT_POLICY_UNVERIFIED');
 const pnl=BigInt(valuation.unrealizedPnlBps);
 if(pnl<=-BigInt(config.stopLossBps))return {action:'SELL',reason:'STOP_LOSS'};
 if(pnl>=BigInt(config.takeProfitBps))return {action:'SELL',reason:'TAKE_PROFIT'};
 if(now-position.openedAt>=config.maxHoldMs)return {action:'SELL',reason:'MAX_HOLD'};
 return {action:'HOLD',reason:'WITHIN_LIMITS'};
}
