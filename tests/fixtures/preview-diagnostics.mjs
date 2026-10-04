// Best-effort diagnostics are independent of application success/failure.
export function createDiagnosticLogger({append,now=()=>new Date().toISOString(),pid,onFailure=()=>{}}){
 let failedWrites=0,reported=false;
 const log=event=>{try{append(JSON.stringify({at:now(),pid,...event})+'\n');return true;}catch{failedWrites++;if(!reported){reported=true;try{onFailure({event:'DIAGNOSTIC_WRITE_UNAVAILABLE',pid});}catch{}}return false;}};
 return {log,get failedWrites(){return failedWrites;}};
}
export const fixtureReadRoutes=new Set(['/api/health','/api/state','/api/strategy-registry','/api/trading/network','/api/trading/leaderboard']);
export function instrumentFixtureRequest(req,res,{log,requestId,now=()=>new Date().toISOString(),clock=Date.now}){
 const at=now(),started=clock();
 res.setHeader('X-TEKKTEAM-Preview-Request-ID',requestId);res.setHeader('X-TEKKTEAM-Preview-Time',at);
 let pathname;try{pathname=new URL(req.url,'http://127.0.0.1:4190').pathname;}catch{}
 const path=req.method==='GET'&&fixtureReadRoutes.has(pathname)?pathname:'DENIED_ROUTE';
 log({event:'REQUEST',requestId,method:['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(req.method)?req.method:'OTHER',path});
 res.once('finish',()=>log({event:'RESPONSE',requestId,status:res.statusCode,durationMs:clock()-started}));
 res.once('close',()=>{if(!res.writableFinished)log({event:'RESPONSE_ABORTED',requestId,status:res.statusCode,durationMs:clock()-started});});
}
