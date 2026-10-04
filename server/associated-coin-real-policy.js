import {resolveAssociatedCoinPaperPolicy} from './associated-coin-paper-policy.js';
import {SOL_MINT,reject} from './dex/intent.js';

// Read-only server authority; request configuration and mutable coin fields do
// not determine scope. This check never authorizes execution or venue support.
export function assertAssociatedCoinRealTarget({agent,scope,receiptAuthority,intent}={}){
 if(!agent?.id||!agent?.creator||intent?.agentId!==agent.id||intent?.owner!==agent.creator)reject('REAL_TARGET_BINDING_MISMATCH');
 if(scope?.scoped===true&&(receiptAuthority?.available!==true||receiptAuthority?.initialized!==true||receiptAuthority.agentId!==agent.id||receiptAuthority.owner!==agent.creator))reject('REAL_TARGET_RECEIPT_UNAVAILABLE');
 const policy=resolveAssociatedCoinPaperPolicy({agent,scope,receipt:receiptAuthority?.receipt});
 if(!policy.available)reject(policy.reason==='LAUNCHPAD_SCOPE_UNAVAILABLE'?'REAL_TARGET_AUTHORITY_UNAVAILABLE':'REAL_TARGET_RECEIPT_UNAVAILABLE');
 if(policy.kind==='ASSOCIATED_COIN'){
  const matches=intent.direction==='BUY'?intent.inputMint===SOL_MINT&&intent.outputMint===policy.mint:intent.direction==='SELL'&&intent.inputMint===policy.mint&&intent.outputMint===SOL_MINT;
  if(!matches)reject('REAL_ASSOCIATED_MINT_MISMATCH');
 }
 return policy;
}

// Fresh canonical row and scope on every call, including after async work.
// A missing or throwing dependency is unavailable, never a General fallback.
export function createAssociatedCoinRealGuard({readAgent,readLaunchpadScope,readReceiptAuthority}={}){
 return intent=>{
  if(typeof readAgent!=='function'||typeof readLaunchpadScope!=='function')reject('REAL_TARGET_AUTHORITY_UNAVAILABLE');
  let agent,scope,receiptAuthority;
  try{agent=readAgent(intent?.agentId);scope=readLaunchpadScope(agent);if(scope?.scoped===true)receiptAuthority=readReceiptAuthority?.(agent);}
  catch{reject('REAL_TARGET_AUTHORITY_UNAVAILABLE');}
  return assertAssociatedCoinRealTarget({agent,scope,receiptAuthority,intent});
 };
}
