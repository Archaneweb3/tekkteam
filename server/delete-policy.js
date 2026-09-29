// Deletion is intentionally narrower than "wallet balance is zero": the
// existing delete path does not archive custody or immutable real-money audit.
export function deleteBlockers({wallet=false,solLamports=null,tokenBalances=[],realPosition=false,activeExecution=false,unresolvedExecution=false,activeReservation=false,pendingSubmission=false,tokenLaunched=false,realHistory=false,paperPosition=false}={}){
 const reasons=[];
 if(solLamports===null&&wallet)reasons.push({code:'WALLET_BALANCE_UNAVAILABLE',message:'Agent Wallet balance could not be verified on Mainnet. Deletion is locked.'});
 else if(BigInt(solLamports??0)>0n)reasons.push({code:'AGENT_WALLET_HAS_SOL',message:`Agent Wallet contains ${(Number(solLamports)/1e9).toFixed(9)} SOL. Resolve its balance before considering deletion.`});
 if(tokenBalances.some(t=>BigInt(t.amount)>0n))reasons.push({code:'AGENT_WALLET_HAS_TOKENS',message:'Agent Wallet contains real tokens. Resolve token holdings before considering deletion.'});
 if(realPosition)reasons.push({code:'REAL_POSITION_OPEN',message:'A Real position is still open. Deletion is locked.'});
 if(activeReservation)reasons.push({code:'ACTIVE_RESERVATION',message:'An active real-money reservation exists. Deletion is locked.'});
 if(unresolvedExecution)reasons.push({code:'UNRESOLVED_EXECUTION',message:'A real-money execution has an unresolved outcome. Deletion is locked.'});
 else if(activeExecution)reasons.push({code:'ACTIVE_EXECUTION',message:'A real-money execution is active. Deletion is locked.'});
 if(pendingSubmission)reasons.push({code:'PENDING_TOKEN_SUBMISSION',message:'A token preparation or submission is pending. Deletion is locked.'});
 if(tokenLaunched)reasons.push({code:'TOKEN_LAUNCHED',message:'A launched token has permanent history. Deletion is locked.'});
 if(paperPosition)reasons.push({code:'PAPER_POSITION_OPEN',message:'A Paper position is open. Stop or close it before considering deletion.'});
 if(wallet||realHistory)reasons.push({code:'CUSTODY_OR_AUDIT_RECORDS',message:'This Agent has custody or real-money audit records. The current delete path cannot safely archive them.'});
 return reasons;
}
