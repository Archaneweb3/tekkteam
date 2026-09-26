// Deliberately no signer/custody import. Unapproved adapters cannot reach secrets.
export {DexQuoteProvider,TradeExecutor,TransactionValidator,PositionReconciler} from './live-interfaces.js';
export function liveExecutionStatus(){return {enabled:false,locked:true,adapterStatus:'NOT_IMPLEMENTED',requested:process.env.LIVE_TRADING_ENABLED==='true',killSwitch:process.env.GLOBAL_TRADING_KILL_SWITCH!=='false'};}
export function validateLiveIntent({intent,state,market,now=Date.now(),programs,allowedPrograms}){
 if(process.env.GLOBAL_TRADING_KILL_SWITCH!=='false')throw Error('GLOBAL_TRADING_STOP');
 if(!state.enabled||state.paused)throw Error('AGENT_PAUSED');
 if(market.network!=='solana:101'||intent.mint!==state.mint||market.mint!==state.mint)throw Error('TOKEN_NETWORK_MISMATCH');
 if(!programs?.length||programs.some(p=>!allowedPrograms?.includes(p)))throw Error('PROGRAM_NOT_APPROVED');
 const values=[intent.sol,intent.positionAfterSol,state.dailySpentSol,intent.slippageBps,market.liquidityUsd,market.observedAt,state.lastTradeAt];
 if(!values.every(Number.isFinite)||intent.sol<=0||intent.sol>.001||intent.positionAfterSol<0||intent.positionAfterSol>.005||state.dailySpentSol<0||state.dailySpentSol+intent.sol>.02||intent.slippageBps<0||intent.slippageBps>100||market.liquidityUsd<10000||now-market.observedAt>30000||market.observedAt>now||now-state.lastTradeAt<60000)throw Error('LIVE_RISK_REJECTED');
 return true;
}
export async function executeLive(){
 // Flag alone is never enough: a separately reviewed deterministic DEX adapter,
 // exact message validator, durable spend reservation and confirmation reconciler
 // are required before enabling any custody signing path.
 throw Error('LIVE_TRADING_LOCKED');
}
