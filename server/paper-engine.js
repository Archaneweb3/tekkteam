export const LIMITS=Object.freeze({maxTradeSol:0.001,maxSolPerTrade:0.001,maxPositionSol:0.005,maxPositionPercent:10,maxOpenPositions:1,maxDailySol:0.02,maxDailySpendSol:0.02,slippageBps:100,maxSlippageBps:100,minLiquidityUsd:10000,cooldownMs:60000,cooldownSeconds:60,paperCapitalSol:0.1,networkFeeSol:0.000005,feeBps:30});
import {PROFILES,strategyConfigFor} from '../public/app/strategy-config.js';
export {PROFILES};
const effective=s=>strategyConfigFor(s.position?.strategyConfig?{strategyConfig:s.position.strategyConfig}:s);
export function strategyIntent(state,market,now){
 const config=effective(state),result=determineIntent(state,market,now),p=PROFILES[config.strategy];
 return {...result,strategyConfig:config,strategyConfigVersion:state.position?.strategyConfigVersion??state.strategyConfigVersion??0,signals:{liquidityPassed:market.liquidityUsd>=config.signal.minLiquidityUsd,volumePassed:market.volume5m>=config.signal.minVolume5mUsd,momentumPassed:market.change5m>=config.signal.minPriceChange5mPercent&&market.change5m<=p.maxChange,ratioPassed:market.buys5m>=Math.max(1,market.sells5m)*p.minRatio},intentId:`${state.agentId??state.mint}:${now}:${result.side}`,agentId:state.agentId??null,mode:state.mode,action:result.side,tokenMint:result.mint??state.mint,tokenSymbol:market.tokenSymbol??market.symbol??null,strategy:config.strategy,requestedSizeSol:result.sol??0,confidence:null,marketSnapshot:{...market},marketSnapshotId:market.snapshotId??null,timestamp:now,createdAt:now};
}
function determineIntent(state,market,now){
 const c=effective(state),p=PROFILES[c.strategy];if(!p)return {side:'HOLD',reason:'Unsupported strategy'};
 if(state.position){const change=market.priceUsd/state.position.entryPriceUsd-1;
  if(change>=c.position.takeProfitPercent/100||change<=-c.position.stopLossPercent/100||now-state.position.openedAt>=15*60000)return {side:'SELL',mint:state.mint,sol:Math.min(state.position.quantity*market.priceUsd/market.solUsd,c.risk.maxSolPerTrade),reason:change>=c.position.takeProfitPercent/100?'Take profit':change<=-c.position.stopLossPercent/100?'Stop loss':'Time limit'};
  return {side:'HOLD',reason:'Position within exit thresholds'};
 }
 if(market.change5m>=c.signal.minPriceChange5mPercent&&market.change5m<=p.maxChange&&market.buys5m>=Math.max(1,market.sells5m)*p.minRatio&&market.volume5m>=c.signal.minVolume5mUsd&&market.liquidityUsd>=c.signal.minLiquidityUsd)return {side:'BUY',mint:state.mint,sol:c.risk.maxSolPerTrade,reason:c.strategy+' entry thresholds met'};
 return {side:'HOLD',reason:'Entry thresholds not met'};
}
export function riskCheck(state,intent,market,now){
 const checks={};const failed=(key,value)=>{checks[key]=!value;return value;};
 const reject=reason=>({allowed:false,reason,reasons:[reason],adjustedSizeSol:0,checks});
 let c;try{c=effective(state);checks.configuration=true;}catch{checks.configuration=false;return reject('Invalid strategy configuration');}
 if(failed('timestamp',!!(!Number.isFinite(now)||now<0)))return reject('Invalid execution timestamp');
 if(failed('killSwitch',!!(state.paperKillSwitch===true)))return reject('Paper emergency kill switch');
 if(failed('mode',!!(state.mode!=='paper'||!state.enabled)))return reject('Trading paused / live execution locked');
 if(failed('allowlist',!!(market.network!=='solana:101'||intent.mint!==state.mint||market.mint!==state.mint)))return reject('Token/network not allowlisted');
 if(failed('maxTrade',!!(!['BUY','SELL'].includes(intent.side)||!Number.isFinite(intent.sol)||intent.sol<=0||intent.sol>c.risk.maxSolPerTrade)))return reject('Maximum trade size');
 if(failed('freshness',!!(!Number.isFinite(market.observedAt)||now-market.observedAt>30000||market.observedAt>now+1000)))return reject('Stale market data');
 if(failed('price',!!(![market.priceUsd,market.solUsd,market.liquidityUsd].every(n=>Number.isFinite(n)&&n>0))))return reject('Invalid market price');
 if(failed('liquidity',!!(market.liquidityUsd<c.signal.minLiquidityUsd)))return reject('Minimum liquidity');
 const native=state.cashSol!==undefined&&state.cashSol!==null;
 if(failed('accounting',!!(!Number.isFinite(state.cashUsd)||(!native&&state.cashUsd<0)||!Number.isFinite(state.realizedUsd??0))))return reject('Invalid paper accounting state');
 if(failed('nativeAccounting',!!(native&&(!Number.isFinite(state.cashSol)||state.cashSol<0||!Number.isFinite(state.initialSol)||state.initialSol<=0||!Number.isFinite(state.realizedSol)))))return reject('Invalid native SOL accounting state');
 if(!native)checks.nativeAccounting=null;
 if(failed('dailyState',!!(state.dailySpentSol!==undefined&&(!Number.isFinite(state.dailySpentSol)||state.dailySpentSol<0))))return reject('Invalid daily spending state');
 if(state.dailySpentSol===undefined)checks.dailyState=null;
 if(failed('cooldownState',!!(state.lastTradeAt!==undefined&&(!Number.isFinite(state.lastTradeAt)||state.lastTradeAt<0))))return reject('Invalid cooldown state');
 if(state.lastTradeAt===undefined)checks.cooldownState=null;
 // Entry cooldown must never delay an existing position's protective exit.
 if(failed('cooldown',!!(intent.side==='BUY'&&state.lastTradeAt&&now-state.lastTradeAt<c.execution.cooldownSeconds*1000)))return reject('Trade cooldown');
 const day=new Date(now).toISOString().slice(0,10),spent=state.dailyDate===day?state.dailySpentSol:0;
 if(failed('dailyAmount',!!(!Number.isFinite(spent)||spent<0)))return reject('Invalid daily spending state');
 if(failed('dailyLimit',!!(spent+intent.sol*(1+LIMITS.feeBps/10000)+LIMITS.networkFeeSol>c.risk.maxDailySpendSol)))return reject('Daily trading limit');
 const impactBps=Math.ceil(intent.sol*market.solUsd/market.liquidityUsd*20000)+25;
 if(failed('slippage',!!(impactBps>c.execution.maxSlippageBps)))return reject('Slippage ceiling');
 if(intent.side==='BUY'){
  if(failed('openPositions',!!(state.position)))return reject('Maximum open positions');
  const initial=state.initialSol??(state.initialUsd?state.initialUsd/market.solUsd:LIMITS.paperCapitalSol);
  if(failed('positionSize',!!(intent.sol>LIMITS.maxPositionSol||intent.sol>initial*c.risk.maxPositionPercent/100)))return reject('Maximum position size');
  const cash=Number.isFinite(state.cashSol)?state.cashSol:state.cashUsd/market.solUsd;
  if(failed('balance',!!(!Number.isFinite(cash)||cash<intent.sol*(1+LIMITS.feeBps/10000)+LIMITS.networkFeeSol)))return reject('Insufficient paper balance');
 }else{
  if(failed('sellPosition',!!(!state.position||!Number.isFinite(state.position.quantity)||state.position.quantity<=0)))return reject('No position to sell');
  if(failed('positionAccounting',!!(state.position.mint!==state.mint||!Number.isFinite(state.position.costUsd)||state.position.costUsd<0||(native&&(!Number.isFinite(state.position.costSol)||state.position.costSol<0||!Number.isFinite(state.position.realizedSol))))))return reject('Invalid position accounting state');
  const proceeds=Math.min(intent.sol,state.position.quantity*market.priceUsd/market.solUsd)*(1-impactBps/10000)*(1-LIMITS.feeBps/10000)-LIMITS.networkFeeSol;
  if(failed('exitFee',!!((native?state.cashSol:state.cashUsd/market.solUsd)+proceeds<0)))return reject('Insufficient paper balance for exit fee');
 }
 return {allowed:true,reason:null,reasons:[],checks,adjustedSizeSol:intent.side==='SELL'?Math.min(intent.sol,state.position.quantity*market.priceUsd/market.solUsd):intent.sol,impactBps,day,spent};
}
// Pure simulated execution. No Connection, Keypair, signing, send or RPC imports.
export function executePaper(state,intent,market,now){
 const risk=riskCheck(state,intent,market,now);if(!risk.allowed)return {risk};
 const price=market.priceUsd*(1+(intent.side==='BUY'?1:-1)*risk.impactBps/10000);
 const amountUsd=risk.adjustedSizeSol*market.solUsd;
 const quantity=intent.side==='BUY'?amountUsd/price:Math.min(state.position.quantity,amountUsd/market.priceUsd);
 const gross=quantity*price,feeUsd=gross*LIMITS.feeBps/10000+LIMITS.networkFeeSol*market.solUsd;
 let realizedUsd=0,realizedSol=null,positionClosed=false,closedPositionPnlSol=null;
 const native=Number.isFinite(state.cashSol),positionId=state.position?.positionId??`${state.agentId??state.mint}:${now}`;
 if(intent.side==='BUY'){
  state.cashUsd-=gross+feeUsd;
  if(native)state.cashSol-=(gross+feeUsd)/market.solUsd;
  state.position={positionId,mint:state.mint,quantity,costUsd:gross+feeUsd,costSol:native?(gross+feeUsd)/market.solUsd:null,realizedSol:native?0:null,entryPriceUsd:price,openedAt:now,strategyConfig:strategyConfigFor(state),strategyConfigVersion:state.strategyConfigVersion??0};
 }else{
  const fraction=quantity/state.position.quantity,basis=state.position.costUsd*fraction;
  realizedUsd=gross-feeUsd-basis;state.cashUsd+=gross-feeUsd;state.realizedUsd=(state.realizedUsd??0)+realizedUsd;
  if(native&&Number.isFinite(state.position.costSol)){
   const basisSol=state.position.costSol*fraction;
   realizedSol=(gross-feeUsd)/market.solUsd-basisSol;
   state.cashSol+=(gross-feeUsd)/market.solUsd;state.realizedSol=(state.realizedSol??0)+realizedSol;
   state.position.costSol-=basisSol;state.position.realizedSol=(state.position.realizedSol??0)+realizedSol;
  }
  state.position.quantity-=quantity;state.position.costUsd-=basis;
  if(state.position.quantity<1e-12){positionClosed=true;closedPositionPnlSol=state.position.realizedSol??null;state.position=null;}
 }
 const solNotional=gross/market.solUsd;
 state.lastTradeAt=now;state.dailyDate=risk.day;state.dailySpentSol=risk.spent+solNotional+feeUsd/market.solUsd;
 return {risk,receipt:{mode:'paper',side:intent.side,mint:state.mint,positionId,positionClosed,closedPositionPnlSol,quantity,priceUsd:price,grossUsd:gross,feeUsd,feeSol:feeUsd/market.solUsd,realizedUsd,realizedSol,solNotional,requestedSizeSol:intent.sol,marketSnapshotId:market.snapshotId??null,confidence:null,slippageBps:risk.impactBps,reason:intent.reason,createdAt:now,signature:null}};
}
export function liveExecution(){throw Error('LIVE_TRADING_LOCKED: independent risk/execution verification required');}
