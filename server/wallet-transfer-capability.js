const ACTIVE_DEX = new Set(['QUOTED','PREPARING','PREPARED','SIGNED','SUBMITTED','UNKNOWN']);

export function withdrawalSafety(db, agentId, wallet, {ignoreWalletRequestId} = {}) {
  // Missing safety ledgers are not evidence that a wallet is safe to drain.
  for (const table of ['dex_positions','dex_executions','real_reserved_accounts']) {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) return {available:false, code:'SAFETY_STATE_UNAVAILABLE', reason:'Wallet safety state is unavailable'};
  }
  try {
    const positions=db.prepare('SELECT data FROM dex_positions WHERE agent_id=?').all(agentId);
    if (positions.some(({data}) => {const p=JSON.parse(data);return p.mode==='REAL' && BigInt(p.quantity)>0n;})) return {available:false,code:'REAL_POSITION_OPEN',reason:'Real position open; exit or resolve it before withdrawing SOL'};
    const executions=db.prepare('SELECT status FROM dex_executions WHERE agent_id=?').all(agentId);
    if (executions.some(({status})=>ACTIVE_DEX.has(status))) return {available:false,code:'PENDING_EXECUTION',reason:'A real execution must resolve before withdrawal'};
    const reservations=db.prepare('SELECT operation_id FROM real_reserved_accounts WHERE wallet=?').all(wallet);
    if (reservations.some(({operation_id})=>!operation_id.startsWith('wallet:')&&operation_id!==`wallet:${ignoreWalletRequestId}`)) return {available:false,code:'ACTIVE_RESERVATION',reason:'Reserved Agent SOL must resolve before withdrawal'};
    return {available:true,code:'AVAILABLE',reason:null};
  } catch {
    return {available:false,code:'SAFETY_STATE_UNAVAILABLE',reason:'Wallet safety state is unavailable'};
  }
}
