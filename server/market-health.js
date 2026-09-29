import {quoteProblem} from './market-radar.js';

// Full bounded discovery batch, not just the eight displayed opportunities.
export function discoveryHealth(universe,held,time){
 const candidates=universe.candidates??[],problems=candidates.map(c=>c.error??quoteProblem(c.quote,c.mint,time));
 const quoted=problems.filter(p=>!p).length,unavailable=candidates.length-quoted;
 const errors=[...problems,held&&(held.error??quoteProblem(held.quote,held.mint,time))].filter(Boolean);
 const sourceFailed=universe.status!=='OK';
 const marketHealth=quoted&&(unavailable||sourceFailed||errors.length)?'DEGRADED':sourceFailed?(universe.status==='RATE_LIMITED'?'RATE_LIMITED':'PROVIDER_UNAVAILABLE'):!errors.length?'HEALTHY':errors.includes('RATE_LIMITED')?'RATE_LIMITED':errors.every(e=>e==='STALE_DATA')?'STALE':'PROVIDER_UNAVAILABLE';
 return {marketHealth,coverage:{discovered:candidates.length,quoted,unavailable}};
}

export function radarHealth(scan,now){
 const stale=Number.isFinite(scan.lastChecked)&&now-scan.lastChecked>30000;
 const previous=scan.marketHealth??({PROVIDER_UNAVAILABLE:'PROVIDER_UNAVAILABLE',ERROR:'PROVIDER_UNAVAILABLE',RATE_LIMITED:'RATE_LIMITED',STALE_DATA:'STALE',DEGRADED:'DEGRADED',SCANNING:'HEALTHY',NO_ELIGIBLE_MARKETS:'HEALTHY',WATCHING:'HEALTHY'}[scan.status])??null;
 // Keep degradation visible alongside ageing; never infer missing legacy counts.
 return {marketHealth:stale&&previous==='HEALTHY'?'STALE':previous,dataStale:stale,lastScanHealth:previous};
}
