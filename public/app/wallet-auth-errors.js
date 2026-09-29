const rejection=error=>error?.code===4001||/reject|cancel|dismiss|closed/i.test(String(error?.message??''));
const offline=error=>error instanceof TypeError&&/fetch|network/i.test(String(error.message));

const safeProviderCode=value=>Number.isSafeInteger(value)?value:typeof value==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(value)?value:null;
const safeProviderName=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(value)?value:null;
const safeProviderMessage=value=>/^(Unexpected error|User rejected request|User cancelled|Method not supported|Unsupported method)$/i.test(String(value??''))?String(value):null;

export function walletAuthError(stage,error,context={}){
 if(error?.walletAuthCode)return error;
 let code;
 if(stage==='PROVIDER_CONNECT')code=rejection(error)?'WALLET_CONNECTION_REJECTED':'WALLET_CONNECTION_FAILED';
 else if(stage==='SIGN_MESSAGE')code=rejection(error)?'SIGNATURE_CANCELLED':'SIGNATURE_FAILED';
 else if(offline(error)||[502,503,504].includes(error?.httpStatus))code='BACKEND_UNAVAILABLE';
 else if(stage==='AUTH_CHALLENGE')code='AUTH_CHALLENGE_FAILED';
 else if(stage==='VERIFY')code='SIGNATURE_VERIFICATION_FAILED';
 else if(stage==='SESSION')code='SESSION_FAILED';
 else code='WALLET_CONNECTION_FAILED';
 if(stage==='SIGN_MESSAGE'&&!rejection(error)){
  if(/unsupported|not supported|not a function/i.test(String(error?.message??'')))code='SIGN_MESSAGE_UNSUPPORTED';
  else if(context.phantom)code='PHANTOM_SIGNING_ERROR';
 }
 const providerStage=stage==='SIGN_MESSAGE'||stage==='PROVIDER_CONNECT';
 return Object.assign(new Error(code),{walletAuthCode:code,walletAuthStage:stage,httpStatus:Number.isInteger(error?.httpStatus)?error.httpStatus:null,providerSource:['WALLET_STANDARD','WINDOW_PHANTOM_SOLANA','WINDOW_SOLFLARE'].includes(context.source)?context.source:null,providerPublicKey:typeof context.publicKey==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(context.publicKey)?context.publicKey:null,providerIsPhantom:typeof context.isPhantom==='boolean'?context.isPhantom:null,messageByteLength:Number.isSafeInteger(context.messageByteLength)&&context.messageByteLength>0?context.messageByteLength:null,providerErrorName:providerStage?safeProviderName(error?.name):null,providerErrorCode:providerStage?safeProviderCode(error?.code):null,providerErrorMessage:providerStage?safeProviderMessage(error?.message):null});
}

export function walletAuthPresentation(error){
 const code=error?.walletAuthCode||'WALLET_CONNECTION_FAILED';
 const messages={WALLET_CONNECTION_REJECTED:['CONNECTION CANCELLED','Connection cancelled.'],SIGNATURE_CANCELLED:['SIGNATURE CANCELLED','Signature request cancelled.'],SIGNATURE_REJECTED:['SIGNATURE CANCELLED','Signature request cancelled.'],AUTH_CHALLENGE_FAILED:["COULDN'T CONNECT WALLET","Couldn't start wallet authentication."],SIGNATURE_VERIFICATION_FAILED:['WALLET VERIFICATION FAILED','Wallet verification failed.'],SESSION_FAILED:['SESSION UNAVAILABLE',"Couldn't create your session."],BACKEND_UNAVAILABLE:['AUTHENTICATION SERVICE UNAVAILABLE','TEKKTEAM authentication service is unavailable.'],PROVIDER_CONFLICT:['WALLET PROVIDER CONFLICT','Multiple wallet providers detected. Select the intended wallet.'],PROVIDER_MISMATCH:['WALLET PROVIDER MISMATCH','The wallet provider changed before signing. Reopen the wallet dialog.'],SOLANA_ACCOUNT_UNAVAILABLE:['SOLANA ACCOUNT UNAVAILABLE','This wallet did not provide a Solana Mainnet account.'],SIGN_MESSAGE_UNSUPPORTED:['SIGNATURE UNSUPPORTED','This provider does not support Solana message signing.'],PHANTOM_SIGNING_ERROR:['PHANTOM SIGNING ERROR','Phantom could not sign the authentication message.'],SIGNATURE_FAILED:['SIGNATURE FAILED','Your wallet could not sign the authentication message.'],WALLET_CONNECTION_FAILED:["COULDN'T CONNECT WALLET","Couldn't connect wallet."]};
 const [title,message]=messages[code]||messages.WALLET_CONNECTION_FAILED;
 const stage=typeof error?.walletAuthStage==='string'&&/^[A-Z_]{3,40}$/.test(error.walletAuthStage)?error.walletAuthStage:'UNKNOWN';
 const httpStatus=Number.isInteger(error?.httpStatus)?error.httpStatus:null;
 const providerDetails=[error?.providerSource&&`Provider source: ${error.providerSource}`,error?.providerPublicKey&&`Public key: ${error.providerPublicKey}`,typeof error?.providerIsPhantom==='boolean'&&`isPhantom: ${error.providerIsPhantom}`,error?.messageByteLength&&`Message bytes: ${error.messageByteLength}`,error?.providerErrorName&&`Provider error name: ${error.providerErrorName}`,error?.providerErrorCode!==null&&error?.providerErrorCode!==undefined&&`Provider error code: ${error.providerErrorCode}`,error?.providerErrorMessage&&`Provider error: ${error.providerErrorMessage}`].filter(Boolean);
 return {title,message,details:`Code: ${code} · Stage: ${stage}${httpStatus?` · HTTP: ${httpStatus}`:''}${providerDetails.length?' · '+providerDetails.join(' · '):''}`};
}
