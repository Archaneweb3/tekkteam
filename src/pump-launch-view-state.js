// A launch receipt describes the token lifecycle. A preparation attempt does not.
export function deriveLaunchViewState({receipt,attempt,phase}={}){
 const r=receipt&&typeof receipt==='object'?receipt:null;
 const a=attempt&&typeof attempt==='object'?attempt:null;
 const status=r?.status||'Idle';
 const launched=status==='Success'&&r.confirmed===true&&!!r.signature&&!!r.mint;
 const signed=!!r?.signature||r?.broadcastAttempted===true;
 const uncertain=signed&&status!=='Success'&&status!=='Failed';
 const pending=uncertain||['Submitted','Confirming','Unknown'].includes(status);
 const unknown=status==='Unknown'||(status==='Confirming'&&/broadcast outcome unknown/i.test(String(r?.notice||'')));
 const lifecycle=launched?'LAUNCHED':pending?(unknown?'UNKNOWN':'PENDING'):'NOT_LAUNCHED';
 const attemptStatus=a?.finalStatus||a?.status||null;
 const failedAttempt=attemptStatus==='FAILED'||attemptStatus==='REJECTED_BEFORE_SIGNING';
 const showFailure=!launched&&!pending&&(status==='Failed'||failedAttempt);
 return {
  lifecycle,attemptStatus,receiptStatus:status,
  initialBuyLamports:Number.isSafeInteger(r?.initialBuyLamports)?r.initialBuyLamports:null,
  canPrepare:status==='Idle'&&!signed&&phase!=='preparing'&&phase!=='awaitingApproval',
  showApproval:!launched&&!signed&&(phase==='awaitingApproval'||status==='Awaiting approval'),
  showPending:pending,showSuccess:launched,showFailure,
  hasHistoricalTransaction:signed,
 };
}
