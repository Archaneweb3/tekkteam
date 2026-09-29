// Shared validation and defaults: the server remains authoritative.
export const PROFILES=Object.freeze({selective:Object.freeze({minChange:0.5,maxChange:5,minRatio:1.5,minVolume:1000,minLiquidity:25000,takeProfit:0.05,stopLoss:0.03}),balanced:Object.freeze({minChange:0.75,maxChange:10,minRatio:1.25,minVolume:750,minLiquidity:15000,takeProfit:0.06,stopLoss:0.035}),momentum:Object.freeze({minChange:1,maxChange:20,minRatio:1.1,minVolume:500,minLiquidity:10000,takeProfit:0.08,stopLoss:0.04})});
export const STRATEGY_FIELDS=Object.freeze({
 signal:{minLiquidityUsd:[10000,1000000000,1000,'USD','Minimum liquidity'],minVolume5mUsd:[0,1000000000,100,'USD','Minimum 5m volume'],minPriceChange5mPercent:[0,20,.25,'%','Minimum momentum']},
 risk:{maxSolPerTrade:[.00001,.001,.00001,'SOL','Maximum trade size'],maxPositionPercent:[.01,10,.5,'%','Maximum position (% of starting capital)'],maxDailySpendSol:[.00002,.02,.001,'SOL','Daily turnover including fees'],maxOpenPositions:[1,1,1,'positions','Maximum open positions']},
 execution:{maxSlippageBps:[25,100,5,'bps','Maximum slippage'],cooldownSeconds:[60,86400,30,'seconds','Cooldown']},
 position:{stopLossPercent:[.1,50,.5,'%','Stop loss'],takeProfitPercent:[.1,100,1,'%','Take profit']}
});
export function defaultStrategyConfig(strategy='balanced'){
 const p=PROFILES[strategy];if(!Object.hasOwn(PROFILES,strategy))throw Error('Unsupported strategy');
 return {strategy,signal:{minLiquidityUsd:p.minLiquidity,minVolume5mUsd:p.minVolume,minPriceChange5mPercent:p.minChange},risk:{maxSolPerTrade:.001,maxPositionPercent:10,maxDailySpendSol:.02,maxOpenPositions:1},execution:{maxSlippageBps:100,cooldownSeconds:60},position:{stopLossPercent:Number((p.stopLoss*100).toFixed(6)),takeProfitPercent:Number((p.takeProfit*100).toFixed(6))}};
}
export function validateStrategyConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!Object.hasOwn(PROFILES,input.strategy))throw Error('Unsupported strategy');
 const allowed=['strategy',...Object.keys(STRATEGY_FIELDS)];if(Object.keys(input).some(k=>!allowed.includes(k)))throw Error('Unknown strategy configuration field');
 const result={strategy:input.strategy};
 for(const [group,fields]of Object.entries(STRATEGY_FIELDS)){
  const value=input[group];if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(fields,k)))throw Error('Invalid '+group+' fields');
  result[group]={};for(const [key,[min,max]]of Object.entries(fields)){
   const n=value[key];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error(`${key} must be between ${min} and ${max}`);
   if(['maxOpenPositions','cooldownSeconds','maxSlippageBps'].includes(key)&&!Number.isInteger(n))throw Error(key+' must be an integer');
   result[group][key]=n;
  }
 }
 if(result.signal.minPriceChange5mPercent>PROFILES[result.strategy].maxChange)throw Error('Minimum momentum exceeds preset maximum momentum');
 if(result.risk.maxDailySpendSol+1e-12<result.risk.maxSolPerTrade*1.003+.000005)throw Error('Daily limit must cover one maximum trade plus simulated fees');
 return result;
}
export const strategyConfigFor=s=>s.strategyConfig?validateStrategyConfig(s.strategyConfig):defaultStrategyConfig(s.strategy);
export const configEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const isCustom=c=>!configEqual(c,defaultStrategyConfig(c.strategy));
export function strategySummary(name,c){const p=PROFILES[c.strategy];return `${name} looks for liquidity ≥ $${c.signal.minLiquidityUsd.toLocaleString('en-US')}, 5m volume ≥ $${c.signal.minVolume5mUsd.toLocaleString('en-US')}, 5m price change ${c.signal.minPriceChange5mPercent}–${p.maxChange}%, and buy:sell count ratio ≥ ${p.minRatio}. Up to ${c.risk.maxSolPerTrade} SOL per simulated trade, ${c.risk.maxPositionPercent}% of starting capital per position, ${c.risk.maxOpenPositions} open position, and ${c.risk.maxDailySpendSol} SOL daily turnover including fees. Slippage ≤ ${c.execution.maxSlippageBps} bps; cooldown ${c.execution.cooldownSeconds}s. New positions exit at −${c.position.stopLossPercent}% / +${c.position.takeProfitPercent}% or after 15 minutes, subject to risk checks. Limits are not profit guarantees.`;}
