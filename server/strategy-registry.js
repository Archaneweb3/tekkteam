import {PROFILES,STRATEGY_FIELDS,defaultStrategyConfig} from '../public/app/strategy-config.js';
import {AUTONOMOUS_V1} from './dex/autonomous-v1.js';

export const REGISTRY_VERSION='1';
const names={selective:'Strict',balanced:'Standard',momentum:'Broad'};
export function strategyRegistry(){
 return {registryVersion:REGISTRY_VERSION,archetypes:[{
  id:'momentum-activity',version:1,name:'Momentum',description:'Positive movement and buying activity in eligible liquid markets.',implementationStatus:'AVAILABLE',selectable:true,supportedModes:['PAPER'],
  modeSupport:{PAPER:'AVAILABLE',CONTROLLED_REAL:'SEPARATELY_AUTHORIZED_EXECUTION',AUTONOMOUS_REAL:'SEPARATELY_GATED_INFRASTRUCTURE'},
  presets:Object.entries(PROFILES).map(([id,p])=>({runtimePresetId:id,displayName:names[id],description:`Positive 5m movement ${p.minChange}–${p.maxChange}%, with liquidity, volume and buying-activity filters.`,implementationStatus:'AVAILABLE',selectable:true,supportedModes:['PAPER'],parameters:defaultStrategyConfig(id),fixedParameters:{maxPriceChange5mPercent:p.maxChange,minBuySellRatio:p.minRatio,maxHoldSeconds:900},effectiveLimits:{maxPositionPercent:STRATEGY_FIELDS.risk.maxPositionPercent[1],maxSolPerTrade:STRATEGY_FIELDS.risk.maxSolPerTrade[1],maxOpenPositions:1}})),
  parameterSchema:structuredClone(STRATEGY_FIELDS),
 },...['trend','recovery'].map(id=>({id,version:1,name:id==='trend'?'Trend':'Recovery',description:'Not implemented.',implementationStatus:'PLANNED',selectable:false,supportedModes:[],presets:[]}))],realPolicyCeilings:{autonomousMaxBuyLamports:String(AUTONOMOUS_V1.maxBuyLamports),authorizationGranted:false}};
}
export function presetDisplayName(id){return names[id]??null;}
