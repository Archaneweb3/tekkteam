export const acceptanceFailureLabel=(reason,{status,signature}={})=>{
 const uncertain=signature!=null||['SIGNED','SUBMITTED','UNKNOWN'].includes(status);
 const tail=uncertain?'A transaction outcome may still be uncertain; reconcile the existing signature. Do not retry.':'The state read failed before signing; no transaction was sent by that attempt.';
 const ownerErrors={OWNER_AUTH_REQUIRED:'Owner session is not authenticated. Reconnect the owner wallet, then check status.',ACCEPTANCE_POLICY_MISMATCH:'This owner or agent does not match the fixed acceptance cycle.',AGENT_WALLET_UNAVAILABLE:'Agent Wallet mapping is unavailable. Emergency Stop remains available to the authenticated owner.',CONTROLLED_SWAP_UNAVAILABLE:'The backend could not complete this control. Check status before another action.'};
 if(ownerErrors[reason])return `${ownerErrors[reason]} (${reason})`;
 if(reason===-32016||reason==='-32016'||reason==='RPC_MIN_CONTEXT_SLOT_NOT_REACHED')return `Mainnet RPC was behind the required pool snapshot slot. ${tail}`;
 if(typeof reason==='number'||/^-\d+$/.test(String(reason??'')))return `Mainnet RPC rejected a state read. ${tail}`;
 return String(reason??'Acceptance status unavailable.');
};
