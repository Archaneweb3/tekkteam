// Only the documented V2 controls used by this bounded READ-ONLY discovery.
// Legacy onlyDirectRoutes/restrictIntermediateTokens are intentionally rejected.
export function applyDiscoveryControls(params,controls={}){
 if(!controls||typeof controls!=='object'||Array.isArray(controls)||Object.keys(controls).some(k=>!['dexes','excludeDexes','maxAccounts'].includes(k)))throw Error('UNDOCUMENTED_DISCOVERY_CONTROL');
 if(controls.dexes!==undefined&&controls.excludeDexes!==undefined)throw Error('CONFLICTING_DEX_CONTROLS');
 for(const key of ['dexes','excludeDexes'])if(controls[key]!==undefined){const v=controls[key];if(typeof v!=='string'||!v.trim()||v!==v.trim()||v.length>250||v.split(',').some(s=>!s.trim()||s!==s.trim()))throw Error('INVALID_DEX_LABELS');params.set(key,v);}
 if(controls.maxAccounts!==undefined){if(!Number.isInteger(controls.maxAccounts)||controls.maxAccounts<1||controls.maxAccounts>64)throw Error('INVALID_ACCOUNT_LIMIT');params.set('maxAccounts',String(controls.maxAccounts));}
 return params;
}
