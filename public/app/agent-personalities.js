// Versioned parameter profiles for the existing momentum/activity evaluator.
// These are signal/sizing preferences, never execution permissions or risk limits.
export const PERSONALITY_VERSION=1;
const profile=(name,label,tradeBps,tp,sl,cooldown,minChange,maxChange,minRatio,minVolume,minLiquidity)=>Object.freeze({name,label,version:PERSONALITY_VERSION,tradeBps,takeProfit:tp/100,stopLoss:sl/100,cooldownSeconds:cooldown,minChange,maxChange,minRatio,minVolume,minLiquidity});
export const PERSONALITIES=Object.freeze({
 guardian:profile('Guardian','Patient & Protective',500,4,2,1800,1.5,5,1.8,1500,30000),
 scout:profile('Scout','Careful Explorer',750,5,2.5,1200,1,8,1.5,1000,25000),
 operator:profile('Operator','Balanced & Disciplined',1000,6,3,600,.75,10,1.25,750,15000),
 hunter:profile('Hunter','Aggressive Opportunity Hunter',1500,8,4,300,.5,15,1.15,600,12500),
 berserker:profile('Berserker','Maximum Aggression',2000,10,5,180,.25,20,1.05,500,10000),
});
const amount=value=>{if(typeof value==='number'&&!Number.isSafeInteger(value)||! /^(0|[1-9]\d*)$/.test(String(value)))throw Error('PERSONALITY_BALANCE_PROOF_REQUIRED');return BigInt(value);};
export function personalitySizeLamports({id,balanceLamports,reserveLamports,ceilingLamports}){
 const p=PERSONALITIES[id];if(!p)throw Error('PERSONALITY_UNKNOWN');
 const balance=amount(balanceLamports),reserve=amount(reserveLamports),ceiling=amount(ceilingLamports);
 const tradable=balance>reserve?balance-reserve:0n,requested=tradable*BigInt(p.tradeBps)/10000n;
 return Object.freeze({personality:id,version:p.version,tradeBps:p.tradeBps,tradableLamports:String(tradable),requestedLamports:String(requested),effectiveLamports:String(requested<ceiling?requested:ceiling),authorizationGranted:false});
}
