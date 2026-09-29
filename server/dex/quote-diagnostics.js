// Persist only bounded, non-secret failure codes. Never persist RPC messages,
// URLs, headers, account bytes, or provider response bodies.
const known = new Map([
 ['WRONG_NETWORK','NETWORK_MISMATCH'],['REAL_MONEY_NETWORK_MISMATCH','NETWORK_MISMATCH'],
 ['INVALID_CPMM_INTENT','AMOUNT_INVALID'],['INVALID_INTEGER_AMOUNT','AMOUNT_INVALID'],
 ['SLIPPAGE_LIMIT','SLIPPAGE_INVALID'],['STALE_POOL_SNAPSHOT','STATE_STALE'],
 ['POOL_SNAPSHOT_LENGTH_MISMATCH','POOL_ACCOUNT_UNAVAILABLE'],
 ['QUOTE_EXPIRED','QUOTE_EXPIRED'],
 ['STALE_CPMM_SNAPSHOT','STATE_STALE'],['POOL_CHANGED_DURING_SNAPSHOT','STATE_STALE'],
 ['POOL_PROVENANCE_FAILED','POOL_PROVENANCE_FAILED'],['POOL_NOT_OPEN','POOL_CLOSED_OR_UNAVAILABLE'],
 ['SWAP_DISABLED','POOL_CLOSED_OR_UNAVAILABLE'],['EMPTY_RESERVE','RESERVE_UNAVAILABLE'],
 ['MISSING_ACCOUNT','POOL_ACCOUNT_UNAVAILABLE'],['AGENT_ACCOUNT_UNAVAILABLE','VAULT_UNAVAILABLE'],
 ['RENT_UNAVAILABLE','RPC_UNAVAILABLE'],['CPMM_PROGRAM_UNAVAILABLE','ADAPTER_NOT_READY'],
 ['NONCLASSIC_TOKEN','TOKEN_PROGRAM_UNSUPPORTED'],['MINT_PROGRAM','TOKEN_PROGRAM_UNSUPPORTED'],
 ['MINT_EXTENSION','TOKEN_PROGRAM_UNSUPPORTED'],['MINT_UNINITIALIZED','MINT_UNAVAILABLE'],
 ['VAULT_PROGRAM','VAULT_UNAVAILABLE'],['VAULT_EXTENSION','VAULT_UNAVAILABLE'],
 ['VAULT_MINT','VAULT_UNAVAILABLE'],['VAULT_AUTHORITY','VAULT_UNAVAILABLE'],
 ['VAULT_STATE','VAULT_UNAVAILABLE'],['VAULT_PDA','VAULT_UNAVAILABLE'],
 ['ZERO_OUTPUT','QUOTE_MATH_FAILED'],['INVALID_FEE_RATES','QUOTE_MATH_FAILED'],
 ['INVALID_INTENT','AMOUNT_INVALID'],['UNSUPPORTED_EXECUTION_VENUE','ADAPTER_NOT_READY']
]);
const provenance=/^(POOL_|CONFIG_|OBS_|AUTH_BUMP|VAULT_DELEGATE|VAULT_CLOSE_AUTHORITY)/;
export function classifyQuoteFailure(error){
 const code=typeof error?.code==='string'?error.code:typeof error?.message==='string'?error.message:'';
 const reason=known.get(code)??(provenance.test(code)?'POOL_PROVENANCE_FAILED':
  /^(fetch failed|ETIMEDOUT|ECONN|ENOTFOUND|429|503)$/.test(code)||/failed to get|fetch failed|timeout|rate limit|429|503/i.test(code)?'RPC_UNAVAILABLE':
  /^(RangeError|TypeError)$/.test(error?.name??'')?'POOL_DECODE_FAILED':'OTHER');
 const safeSnapshot={};
 for(const field of ['poolFetchContextSlot','dependentFetchContextSlot','currentRpcSlot','poolFetchedAt','dependentSnapshotFetchedAt','quoteEvaluatedAt','slotDelta','ageMs','maxAgeMs','accountCountExpected','accountCountReceived','minContextSlot','cacheTtlMs']){
  const value=error?.snapshotDiagnostic?.[field];
  if(value===null||Number.isSafeInteger(value))safeSnapshot[field]=value;
 }
 if(error?.snapshotDiagnostic?.source==='FRESH_MAINNET_RPC')safeSnapshot.source='FRESH_MAINNET_RPC';
 return {stage:'QUOTE',code:reason,detail:/^[A-Z][A-Z0-9_]{2,64}$/.test(code)?code:null,...(Object.keys(safeSnapshot).length?{snapshot:safeSnapshot}:{})};
}
