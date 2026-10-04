// Presentation only. Wallet capability and authentication decisions stay in backend.js.
export function walletSelectionStatus(wallet){
 if(wallet.selectable)return '';
 if(wallet.capabilityState==='NOT_INSTALLED'||wallet.installUrl)return 'Not detected in this browser';
 if(wallet.capabilityState==='SOLANA_ACCOUNT_UNAVAILABLE'||wallet.capabilityState==='SOLANA_SIGNING_UNSUPPORTED')return 'Solana unavailable';
 return 'Unavailable';
}

export function walletFailureStatus(error){
 switch(error?.walletAuthCode){
  case 'WALLET_CONNECTION_REJECTED':
  case 'SIGNATURE_CANCELLED':return 'Connection cancelled';
  case 'SOLANA_ACCOUNT_UNAVAILABLE':
  case 'SIGN_MESSAGE_UNSUPPORTED':return 'Solana unavailable';
  case 'BACKEND_UNAVAILABLE':return 'Temporarily unavailable';
  default:return 'Couldn’t connect';
 }
}
