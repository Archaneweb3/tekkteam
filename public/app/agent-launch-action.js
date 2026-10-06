// Presentation from the authenticated canonical lifecycle, never a launch permission.
export function agentLaunchAction(lifecycle,agentId){
 const unavailable={label:'TOKEN STATUS UNAVAILABLE',action:null};
 if(lifecycle?.agent?.id!==agentId)return unavailable;
 const launch=lifecycle.launch;
 if(launch?.state==='CONFIGURED_NOT_LAUNCHED')return {label:'REVIEW LAUNCH →',action:'review'};
 if(launch?.state==='CONFIRMED')return lifecycle.token?.mint&&launch.signature&&launch.network==='solana:101'?{label:'VIEW TOKEN ↗',action:'lifecycle'}:unavailable;
 if(['PREPARED','AWAITING_OWNER_APPROVAL','RECONCILIATION_REQUIRED','FAILED','NOT_CONFIGURED'].includes(launch?.state))return {label:'VIEW TOKEN STATUS →',action:'lifecycle'};
 return unavailable;
}
