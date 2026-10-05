import {walletAuthError} from './wallet-auth-errors.js';
import {createPreviewConnection} from './preview-wallet.js';
import {walletShortcuts,walletName,injectedWallet} from './wallet-catalog.js';
import {normalizeTokenDraft} from '../../src/token-draft-schema.js';
import {assertM4ReviewLifetime} from '../../src/pump-review-lifetime.js';
const detachedKey='tekkteam:owner-detached';
export function ownerAccessDetached(){try{return sessionStorage.getItem(detachedKey)==='1';}catch{return false;}}
function setOwnerDetached(value){try{if(value)sessionStorage.setItem(detachedKey,'1');else sessionStorage.removeItem(detachedKey);}catch{}}
export async function request(path, options = {}) {
  if(ownerAccessDetached()&&!['/state','/health','/strategy-registry','/auth/challenge','/auth/verify','/auth/logout'].includes(path))throw Object.assign(Error('Owner sign-in required.'),{httpStatus:401});
  if (window.TekkworkDemo) {
    if (path === '/state' && (!options.method || options.method === 'GET')) return structuredClone(window.TekkworkDemo);
    throw new Error('Client demo only. Wallet login, saving and token issuance require the hosted backend.');
  }
  const response = await fetch((window.TekkworkApiBase||'/api') + path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  let malformed=false;
  const data = await response.json().catch(() => {malformed=true;return {};});
  if (!response.ok) {
    const fallback=[401,403].includes(response.status)?'Access is unavailable for this request.':'The TEKKTEAM API request failed.';
    throw Object.assign(new Error(typeof data?.error==='string'?data.error:fallback),{submissionState:data?.submissionState==='REJECTED_BEFORE_BROADCAST'?data.submissionState:undefined,httpStatus:response.status,code:typeof data?.code==='string'&&data.code.startsWith('BALANCE_RPC_')?data.code:undefined});
  }
  if(malformed)throw Object.assign(Error('The TEKKTEAM API returned an invalid response.'),{httpStatus:response.status,code:'API_RESPONSE_INVALID'});
  if(path==='/state'&&ownerAccessDetached())return {config:data.config,localFixture:data.localFixture,session:null,agents:[],events:[],stats:{}};
  return data;
}
export const post = (path, body = {}, headers = {}) => request(path, { method: 'POST', body: JSON.stringify(body), headers });
// Metadata transport only. The caller retains the exact envelope/key for explicit retry.
export async function saveTokenDraft(agentId,envelope,idempotencyKey){
 const invalid=()=>{throw Object.assign(Error('Invalid first-token save request'),{code:'TOKEN_DRAFT_TRANSPORT_INPUT'});};
 if(typeof agentId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(agentId)||typeof idempotencyKey!=='string'||!/^[\x21-\x7e]{8,100}$/.test(idempotencyKey))invalid();
 let fields;try{if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||![Object.prototype,null].includes(Object.getPrototypeOf(envelope)))invalid();fields=Object.getOwnPropertyDescriptors(envelope);}catch{invalid();}
 if(Reflect.ownKeys(fields).some(k=>typeof k!=='string'||!['draft','expectedRevision','tokenImage'].includes(k))||Object.values(fields).some(d=>!Object.hasOwn(d,'value')||!d.enumerable)||fields.expectedRevision?.value!==0||!fields.draft)invalid();
 let draft;try{draft=normalizeTokenDraft(fields.draft.value);}catch{invalid();}
 const upload=fields.tokenImage;
 if(upload&&(Object.hasOwn(draft,'image')||typeof upload.value!=='string'||!upload.value||upload.value.length>4500000))invalid();
 if(!upload&&!draft.image)invalid();
 const body={draft,expectedRevision:0,...(upload?{tokenImage:upload.value}:{})};
 return post('/launchpad/agents/'+encodeURIComponent(agentId)+'/token-draft',body,{'idempotency-key':idempotencyKey});
}
const providers = new Map();
const registered = [];
const standardIds=new WeakMap();let nextStandardId=0;
const register = (...wallets) => { for (const wallet of wallets) if (!registered.includes(wallet)) registered.push(wallet); return () => wallets.forEach(w => { const i = registered.indexOf(w); if (i >= 0) registered.splice(i, 1); }); };
window.addEventListener('wallet-standard:register-wallet', e => e.detail({ register }));
window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register } }));
let active = null, account = null, authRevision = 0, authInFlight=false, watchedProvider = null, watchedOwner = null, watchedRevision=-1, watchedSelection=null, sessionMutation=Promise.resolve();
function mutateSession(action){const next=sessionMutation.then(action,action);sessionMutation=next.catch(()=>{});return next;}
// Presentation metadata only; session ownership remains server-authoritative.
export function connectedWalletPresentation(owner){
 if(!owner)return null;
 const matched=registered.filter(w=>w.accounts?.some(a=>a.address===owner));
 const selected=active&&(!active.standard||account?.address===owner)?active:matched.length===1?{name:matched[0].name,standard:matched[0]}:window.phantom?.solana?.publicKey?.toBase58()===owner?{name:'Phantom',injected:window.phantom.solana}:null;
 if(!selected)return null;
 const image=selected.standard?.icon||registered.find(w=>w.name===selected.name)?.icon;
 return {name:walletName(selected.name)||'Wallet provider',icon:typeof image==='string'&&(/^(data:image\/(svg\+xml|png|webp|jpeg);base64,)/i.test(image)||/^https:\/\//i.test(image))?image:null};
}
let stopWatching;
function watchAccount(selected,owner){
 if(watchedProvider===(selected.standard||selected.injected)&&watchedOwner===owner&&watchedRevision===authRevision)return;
 stopWatching?.();
 watchedProvider=selected.standard||selected.injected;watchedOwner=owner;watchedSelection=selected;watchedRevision=authRevision;
 const revision=authRevision;
 const changed=address=>{if(address===owner||revision!==authRevision)return;++authRevision;setOwnerDetached(true);stopWatching?.();stopWatching=null;watchedProvider=null;watchedOwner=null;watchedSelection=null;active=null;account=null;window.dispatchEvent(new CustomEvent('tekkwork:wallet-account-changed'));void mutateSession(()=>post('/auth/logout')).catch(()=>{});};
 if(selected.standard?.features['standard:events'])stopWatching=selected.standard.features['standard:events'].on('change',e=>{if(e.accounts)changed(e.accounts.find(a=>a.address===owner&&a.chains?.includes('solana:mainnet'))?.address);});
 else if(selected.injected?.on){const handler=key=>changed(key?.toBase58()),disconnected=()=>changed(null);selected.injected.on('accountChanged',handler);selected.injected.on('disconnect',disconnected);stopWatching=()=>{selected.injected.removeListener?.('accountChanged',handler);selected.injected.removeListener?.('disconnect',disconnected);};if(selected.injected.publicKey?.toBase58()!==owner)changed(selected.injected.publicKey?.toBase58());}
}
export function cancelOwnerAuthentication(){++authRevision;setOwnerDetached(true);}
export function observeExistingWallet(owner,display){
 if(active||!owner)return;
 const candidates=registered.filter(w=>w.accounts?.some(a=>a.address===owner&&a.chains?.includes('solana:mainnet'))).map(w=>({name:walletName(w.name),standard:w}));
 for(const [name,injected]of ['Phantom','Solflare','Trust Wallet'].map(name=>[name,injectedWallet(name,window)]))if(injected?.isConnected&&injected.publicKey?.toBase58()===owner&&!candidates.some(w=>w.name.toLowerCase()===name.toLowerCase()))candidates.push({name,injected});
 const matched=display?.name?candidates.filter(w=>w.name.toLowerCase()===display.name.toLowerCase()):candidates;
 if(matched.length===1)watchAccount(matched[0],owner);
}
export function wallets({readOnly=false}={}) {
  providers.clear();
  const candidates=[];
  const named=walletName;
  registered.forEach((wallet,i)=>{
    const name=named(wallet.name),features=wallet.features||{},mainnet=wallet.chains?.includes('solana:mainnet')||wallet.accounts?.some(a=>a.chains?.includes('solana:mainnet'));
    const capable=typeof features['standard:connect']?.connect==='function'&&(readOnly||typeof features['solana:signMessage']?.signMessage==='function')&&!!mainnet;
    const mainnetAccount=wallet.accounts?.some(a=>a.chains?.includes('solana:mainnet'));
    const status=!capable?(mainnet?'Solana signing unsupported':'Solana account unavailable'):mainnetAccount?'Ready':'Connect to verify Solana account';
    if(!standardIds.has(wallet))standardIds.set(wallet,`standard-${nextStandardId++}`);
    const id=standardIds.get(wallet);
    candidates.push({id,brand:name,name,displayName:name,icon:wallet.icon||null,source:'WALLET_STANDARD',account:wallet.accounts?.find(a=>a.chains?.includes('solana:mainnet'))||null,publicKey:wallet.accounts?.find(a=>a.chains?.includes('solana:mainnet'))?.address||null,chains:wallet.chains||[],features:Object.keys(features),connectionState:mainnetAccount?'CONNECTED':'DISCONNECTED',capabilityState:!capable?(mainnet?'SOLANA_SIGNING_UNSUPPORTED':'SOLANA_ACCOUNT_UNAVAILABLE'):mainnetAccount?'READY':'CONNECT_TO_VERIFY_SOLANA_ACCOUNT',status,selectable:capable,probeAvailable:capable,priority:capable?3:0,adapter:capable?{name,standard:wallet}:null});
  });
  if(window.phantom?.solana?.isPhantom===true){
    const injected=window.phantom.solana,capable=typeof injected.connect==='function'&&(readOnly||typeof injected.signMessage==='function');
    candidates.push({id:'phantom',brand:'Phantom',name:'Phantom',displayName:'Phantom',icon:registered.find(w=>/phantom/i.test(w.name))?.icon||injected.icon||null,source:'WINDOW_PHANTOM_SOLANA',account:null,publicKey:injected.publicKey?.toBase58()||null,chains:['solana:mainnet'],features:['connect','signMessage'],connectionState:injected.isConnected?'CONNECTED':'DISCONNECTED',capabilityState:capable?'CONNECT_TO_VERIFY_SOLANA_ACCOUNT':'SOLANA_SIGNING_UNSUPPORTED',status:capable?'Connect to verify Solana account':'Solana signing unsupported',selectable:capable,probeAvailable:capable,priority:capable?2:0,adapter:capable?{name:'Phantom',injected}:null});
  }
  if(window.solflare?.isSolflare===true){
    const injected=window.solflare,capable=typeof injected.connect==='function'&&(readOnly||typeof injected.signMessage==='function');
    candidates.push({id:'solflare',brand:'Solflare',name:'Solflare',displayName:'Solflare',icon:registered.find(w=>/solflare/i.test(w.name))?.icon||injected.icon||null,source:'WINDOW_SOLFLARE',account:null,publicKey:injected.publicKey?.toBase58()||null,chains:['solana:mainnet'],features:['connect','signMessage'],connectionState:injected.isConnected?'CONNECTED':'DISCONNECTED',capabilityState:capable?'CONNECT_TO_VERIFY_SOLANA_ACCOUNT':'SOLANA_SIGNING_UNSUPPORTED',status:capable?'Connect to verify Solana account':'Solana signing unsupported',selectable:capable,probeAvailable:capable,priority:capable?2:0,adapter:capable?{name:'Solflare',injected}:null});
  }
  if(!candidates.some(wallet=>wallet.brand==='Solflare'&&wallet.selectable))candidates.push({id:'solflare-unavailable',brand:'Solflare',name:'Solflare',displayName:'Solflare',icon:null,source:'OFFICIAL_INSTALL',account:null,publicKey:null,chains:[],features:[],connectionState:'NOT_INSTALLED',capabilityState:'NOT_INSTALLED',status:'Not installed',selectable:false,probeAvailable:false,priority:-1,adapter:null,installUrl:'https://www.solflare.com/download/'});
  if(window.ethereum?.isMetaMask)candidates.push({id:'metamask-evm',brand:'MetaMask',name:'MetaMask',displayName:'MetaMask',icon:registered.find(w=>/metamask/i.test(w.name))?.icon||null,source:'EVM_FALLBACK',account:null,publicKey:null,chains:[],features:[],connectionState:'DISCONNECTED',capabilityState:'SOLANA_ACCOUNT_UNAVAILABLE',status:'Solana account unavailable',selectable:false,probeAvailable:false,priority:-1,adapter:null});
  const trust=injectedWallet('Trust Wallet',window);
  if(trust){let publicKey=null;try{publicKey=trust.publicKey?.toBase58()||null;}catch{}const capable=typeof trust.connect==='function'&&(readOnly||typeof trust.signMessage==='function');candidates.push({id:'trust-solana',brand:'Trust Wallet',name:'Trust Wallet',displayName:'Trust Wallet',icon:trust.icon||null,source:'WINDOW_TRUST_SOLANA',publicKey,chains:['solana:mainnet'],selectable:capable,probeAvailable:false,priority:capable?2:0,capabilityState:capable?'CONNECT_TO_VERIFY_SOLANA_ACCOUNT':'SOLANA_SIGNING_UNSUPPORTED',adapter:capable?{name:'Trust Wallet',injected:trust}:null});}
  for(const [name,installUrl] of walletShortcuts)if(!candidates.some(w=>w.brand===name))candidates.push({id:name.toLowerCase().replaceAll(' ','-')+'-unavailable',brand:name,name,displayName:name,source:'OFFICIAL_INSTALL',account:null,publicKey:null,chains:[],features:[],connectionState:'NOT_INSTALLED',capabilityState:'NOT_INSTALLED',status:'Not detected',selectable:false,probeAvailable:false,priority:-1,adapter:null,installUrl});
  const chosen=new Map();
  for(const candidate of candidates){const key=candidate.brand.toLowerCase();if(!chosen.has(key)||candidate.priority>chosen.get(key).priority)chosen.set(key,candidate);}
  const order=name=>{const i=walletShortcuts.findIndex(([n])=>n===name);return i<0?100:i;};
  return [...chosen.values()].filter(row=>walletShortcuts.some(([name])=>name===row.brand)||row.selectable).sort((a,b)=>order(a.brand)-order(b.brand)).map(({priority,adapter,...row})=>{if(adapter)providers.set(row.id,adapter);return row;});
}
const providerSource=selected=>selected.standard?'WALLET_STANDARD':selected.injected===window.phantom?.solana?'WINDOW_PHANTOM_SOLANA':selected.injected===window.solflare?'WINDOW_SOLFLARE':selected.name==='Trust Wallet'?'WINDOW_TRUST_SOLANA':'UNKNOWN';
const publicConnection=createPreviewConnection({
 getProvider:id=>{const selected=providers.get(id);if(!selected)return null;if(selected.standard)return registered.includes(selected.standard)?selected:null;return selected.injected===injectedWallet(selected.name,window)?selected:null;},
 validateAddress:value=>{try{return typeof value==='string'&&window.TekkworkSDK.bs58.decode(value).length===32;}catch{return false;}},
 onChange:()=>window.dispatchEvent(new CustomEvent('tekkwork:public-wallet-changed'))
});
export const publicWalletPresentation=()=>publicConnection.presentation;
export const connectPublicWallet=id=>publicConnection.connect(id);
export const disconnectPublicWallet=()=>publicConnection.disconnect();
const providerContext=(selected,owner,messageByteLength)=>({source:providerSource(selected),phantom:/^phantom$/i.test(selected.name),isPhantom:selected.injected?selected.injected.isPhantom===true:undefined,publicKey:owner,messageByteLength});
const providerError=(code,stage)=>Object.assign(Error(code),{walletAuthCode:code,walletAuthStage:stage});
function assertProviderBinding(id,selected,owner,connectedAccount){
 if(providers.get(id)!==selected||selected.standard&&!registered.includes(selected.standard)||selected.injected&&injectedWallet(selected.name,window)!==selected.injected)throw providerError('PROVIDER_MISMATCH','SIGN_MESSAGE');
 if(selected.standard&&connectedAccount?.address!==owner||selected.injected&&(selected.injected.isConnected===false||selected.injected.publicKey?.toBase58()!==owner))throw providerError('PROVIDER_MISMATCH','SIGN_MESSAGE');
 if(selected.standard&&(!connectedAccount.chains?.includes('solana:mainnet')||!selected.standard.accounts?.some(a=>a.address===owner&&a.chains?.includes('solana:mainnet'))))throw providerError('PROVIDER_MISMATCH','SIGN_MESSAGE');
}
function signMessageBytes(message){
 if(typeof message!=='string'||!message.length)throw providerError('AUTH_CHALLENGE_FAILED','AUTH_CHALLENGE');
 const bytes=new TextEncoder().encode(message);
 if(!(bytes instanceof Uint8Array)||!bytes.length)throw providerError('AUTH_CHALLENGE_FAILED','AUTH_CHALLENGE');
 return bytes;
}
async function signSelected(id,selected,owner,connectedAccount,message){
 const bytes=signMessageBytes(message);
 assertProviderBinding(id,selected,owner,connectedAccount);
 const feature=selected.standard?.features['solana:signMessage'];
 if(selected.standard&&typeof feature?.signMessage!=='function'||selected.injected&&typeof selected.injected.signMessage!=='function')throw providerError('SIGN_MESSAGE_UNSUPPORTED','SIGN_MESSAGE');
 try{
  const signature=selected.standard?(await feature.signMessage({account:connectedAccount,message:bytes}))[0]?.signature:(await selected.injected.signMessage(bytes,'utf8')).signature;
  if(!(signature instanceof Uint8Array)||signature.length!==64)throw providerError('SIGN_MESSAGE_UNSUPPORTED','SIGN_MESSAGE');
  return {signature,messageByteLength:bytes.length};
 }catch(error){throw walletAuthError('SIGN_MESSAGE',error,providerContext(selected,owner,bytes.length));}
}
export async function connect(id,{reviewChallenge,connectedOwner}={}) {
  if(authInFlight)throw providerError('SIGN_IN_PENDING','SIGN_MESSAGE');
  authInFlight=true;
  const revision=++authRevision;
  try{
  const current=()=>{if(revision!==authRevision)throw Error('Wallet sign-in cancelled or superseded.');};
  const selected = providers.get(id); if (!selected) throw new Error('Wallet is no longer available. Reopen the connection dialog.');
  const step=async(stage,action)=>{try{current();const result=await action();current();return result;}catch(error){throw walletAuthError(stage,error);}};
  let owner, connectedAccount;
  if(connectedOwner!==undefined){
    if(!publicConnection.isConnectedTo(id,connectedOwner))throw providerError('PROVIDER_MISMATCH','PUBLIC_KEY');
    owner=connectedOwner;connectedAccount=selected.standard?.accounts?.find(a=>a.address===owner&&a.chains?.includes('solana:mainnet'));
    assertProviderBinding(id,selected,owner,connectedAccount);
  } else if (selected.standard) {
    const result = await step('PROVIDER_CONNECT',()=>selected.standard.features['standard:connect'].connect());
    connectedAccount = await step('PUBLIC_KEY',()=>result.accounts?.find(a => a.chains?.includes('solana:mainnet')));
    if (!connectedAccount) throw providerError('SOLANA_ACCOUNT_UNAVAILABLE','PUBLIC_KEY');
    owner = connectedAccount.address;
  } else { await step('PROVIDER_CONNECT',()=>selected.injected.connect()); owner = await step('PUBLIC_KEY',()=>selected.injected.publicKey.toBase58()); }
  try{if(window.TekkworkSDK.bs58.decode(owner).length!==32)throw Error('Invalid Solana account');}catch{throw providerError('SOLANA_ACCOUNT_UNAVAILABLE','PUBLIC_KEY');}
  const challenge = await step('AUTH_CHALLENGE',()=>post('/auth/challenge', { address: owner }));
  if(challenge.manualApprovalRequired===true||typeof reviewChallenge==='function'){
    if(typeof reviewChallenge!=='function'||await reviewChallenge(challenge,owner)!==true)throw walletAuthError('AUTH_CHALLENGE',Error('Local sign-in not approved. No signature requested.'));
    if(Date.now()>=challenge.expires)throw walletAuthError('AUTH_CHALLENGE',Error('Local sign-in challenge expired.'));
    current();assertProviderBinding(id,selected,owner,connectedAccount);
    if(selected.standard&&!selected.standard.accounts?.some(a=>a.address===owner&&a.chains?.includes('solana:mainnet'))||selected.injected&&selected.injected.isConnected!==true)throw providerError('PROVIDER_MISMATCH','SIGN_MESSAGE');
  }
  current();
  const {signature}=await signSelected(id,selected,owner,connectedAccount,challenge.message);
  current();assertProviderBinding(id,selected,owner,connectedAccount);
  await step('VERIFY',()=>mutateSession(async()=>{current();assertProviderBinding(id,selected,owner,connectedAccount);const result=await post('/auth/verify', { id: challenge.id, signature: window.TekkworkSDK.bs58.encode(signature) });try{current();assertProviderBinding(id,selected,owner,connectedAccount);}catch(error){if(revision===authRevision)setOwnerDetached(true);await post('/auth/logout');throw error;}return result;}));
  await step('SESSION',()=>{assertProviderBinding(id,selected,owner,connectedAccount);active = selected;account=connectedAccount;watchAccount(selected,owner);});current();setOwnerDetached(false);return owner;
  }catch(error){if(revision===authRevision)setOwnerDetached(true);throw error;}finally{authInFlight=false;}
}
export function phantomSignProbeAvailable(){return ['127.0.0.1','localhost'].includes(location.hostname)&&location.port==='5188'&&new URLSearchParams(location.search||'').get('walletDiagnostics')==='1';}
export async function probePhantomSignature(id){
 return probeWalletSignature(id);
}
export async function probeWalletSignature(id){
 if(!phantomSignProbeAvailable())throw providerError('SIGN_MESSAGE_UNSUPPORTED','SIGN_MESSAGE');
 const selected=providers.get(id);if(!selected||!['Phantom','Solflare','MetaMask'].includes(selected.name))throw providerError('PROVIDER_MISMATCH','PROVIDER_CONNECT');
 let probeAccount,owner;
 try{
  if(selected.standard){const result=await selected.standard.features['standard:connect'].connect();probeAccount=result.accounts?.find(a=>a.chains?.includes('solana:mainnet'));owner=probeAccount?.address;}
  else{await selected.injected.connect();owner=selected.injected.publicKey?.toBase58();}
 }catch(error){throw walletAuthError('PROVIDER_CONNECT',error,providerContext(selected));}
 if(!owner)throw providerError('SOLANA_ACCOUNT_UNAVAILABLE','PUBLIC_KEY');
 const {messageByteLength}=await signSelected(id,selected,owner,probeAccount,'TEKKTEAM wallet verification test');
 return {source:providerSource(selected),isPhantom:selected.injected?selected.injected.isPhantom===true:null,publicKey:owner,signMessageAvailable:true,walletStandardSignMessageAvailable:typeof selected.standard?.features['solana:signMessage']?.signMessage==='function',messageByteLength};
}
export async function disconnect() {
  ++authRevision;setOwnerDetached(true);const selected=active||watchedSelection;
  stopWatching?.();stopWatching=null;watchedProvider=null;watchedOwner=null;watchedSelection=null;
  active = null; account = null;
  const logout=mutateSession(()=>post('/auth/logout'));
  logout.catch(()=>{});
  try { if (selected?.standard) await selected.standard.features['standard:disconnect']?.disconnect(); else await selected?.injected?.disconnect(); } catch {}
  await logout;
}
// Read-only binding accessor. No connect, authentication or signing methods.
export function preparationWallet(owner){
 const selected=active||watchedSelection,current=selected?.standard?.accounts?.find(a=>a.address===owner&&a.chains?.includes('solana:mainnet'));
 const assertBound=()=>{
  if(!selected||selected!==(active||watchedSelection)||ownerAccessDetached())throw Error('Owner wallet connection changed');
  if(selected.standard){if(!registered.includes(selected.standard)||!current||!selected.standard.accounts?.includes(current)||(active&&account?.address!==owner))throw Error('Owner Solana account changed');}
  else{const injected=injectedWallet(selected.name,window);if(injected!==selected.injected||!injected?.isConnected||injected.publicKey?.toBase58()!==owner)throw Error('Owner wallet disconnected or changed');}
 };
 assertBound();return Object.freeze({assertBound});
}
export function launchWallet(owner){
  if(window.TekkworkWalletTestOnly)throw Error('Transactions are disabled in this wallet verification environment.');
  return boundTransactionWallet(owner);
}
const m4ApprovalRequests=new Set();
export function m4LaunchWallet(owner){
 const binding=preparationWallet(owner);
 return {assertBound:binding.assertBound,async signTransaction(base64,review,assertReady){
  binding.assertBound();
  // Same authenticated status read proves the live M4 capability AND exact latch.
  // A disabled/unmounted runtime returns no approvalCapability; never use cache.
  const current=await request('/launchpad/agents/'+encodeURIComponent(review?.result?.launch?.agentId)+'/execution/status'),capability=current.approvalCapability??{};
  if(capability.mode!=='M4_CONTROLLED_SINGLE_LAUNCH'||capability.controlledOwnerApproval!==true||capability.m4Target?.owner!==owner||review?.status!=='AWAITING_WALLET_APPROVAL'||review.result?.launch?.agentId!==capability.m4Target.agentId||review.result?.launch?.initialBuyLamports!==0||review.result?.executionReview?.ceilingLamports!==10000000||review.walletTransactionBase64!==base64||m4ApprovalRequests.has(review.executionId))throw Error('Single reviewed M4 approval unavailable');
  if(current.status!=='AWAITING_WALLET_APPROVAL'||current.executionId!==review.executionId||current.result?.executionReview?.digest!==review.result.executionReview.digest)throw Error('M4 review changed');
  if(current.result.transactionBase64!==review.result.transactionBase64)throw Error('M4 review changed; no wallet prompt opened');
  if(current.signingOrder!==review.signingOrder)throw Error('M4 signing order changed');
  const ownerFirst=current.signingOrder==='OWNER_FIRST_MINT_AFTER_APPROVAL';
  const {Transaction,Buffer}=window.TekkworkSDK,partial=Transaction.from(Buffer.from(base64,'base64')),unsigned=Transaction.from(Buffer.from(current.result.transactionBase64,'base64'));
  if(partial.signature!==null||!partial.verifySignatures(false)||!partial.serializeMessage().equals(unsigned.serializeMessage()))throw Error('M4 reviewed bytes or mint signature changed');
  if(ownerFirst&&(base64!==current.result.transactionBase64||partial.signatures.some(s=>s.signature!==null)))throw Error('M4 owner-first bytes changed');
  const fingerprint=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  const reviewedPayloadSha256=await fingerprint(Buffer.from(current.result.transactionBase64,'base64')),presentedPayloadSha256=await fingerprint(partial.serialize({requireAllSignatures:false,verifySignatures:true}));
  const reviewedMessageSha256=await fingerprint(unsigned.serializeMessage()),presentedMessageSha256=await fingerprint(partial.serializeMessage());
  if(reviewedPayloadSha256!==current.result.transactionSha256||reviewedMessageSha256!==presentedMessageSha256||ownerFirst&&reviewedPayloadSha256!==presentedPayloadSha256)throw Error('M4 transaction fingerprint changed');
  binding.assertBound();if(typeof assertReady!=='function')throw Error('Launch dialog binding required');assertReady();const openedAt=Date.now();let remainingMs;try{remainingMs=assertM4ReviewLifetime(review.result,openedAt);}catch(error){error.walletRequestOpened=false;throw error;}m4ApprovalRequests.add(review.executionId);
  console.info('M4 wallet transaction request',JSON.stringify({executionId:review.executionId,signingOrder:current.signingOrder,openedAt,reviewStartedAt:review.result.executionReview.startedAt,expiresAt:review.result.executionReview.expiresAt,remainingMs,reviewedPayloadSha256,presentedPayloadSha256,reviewedMessageSha256,presentedMessageSha256}));
  try{return await boundTransactionWallet(owner,ownerFirst).signTransaction(base64);}catch(error){error.walletRequestOpened=true;throw error;}
 }};
}
function boundTransactionWallet(owner,ownerFirst=false){
  const selected=active||watchedSelection,current=selected?.standard?.accounts?.find(a=>a.address===owner);
  const assertBound=()=>{
    if(!selected||selected!==(active||watchedSelection)||ownerAccessDetached())throw Error('Reconnect your selected owner wallet');
    if(selected.standard){
      if(!registered.includes(selected.standard)||(active&&account?.address!==owner)||!selected.standard.accounts?.some(a=>a===current&&a.address===owner&&a.chains?.includes('solana:mainnet')))throw Error('Owner wallet account changed');
    }else{
      const injected=selected.name==='Phantom'?window.phantom?.solana:selected.name==='Solflare'?window.solflare:null;
      if(injected!==selected.injected||!injected?.isConnected||injected.publicKey?.toBase58()!==owner)throw Error('Owner wallet disconnected or changed');
    }
  };
  assertBound();
  return {assertBound,async signTransaction(base64){
    assertBound();const {Buffer,Transaction}=window.TekkworkSDK;let signed;
    if(selected.standard){
      const feature=selected.standard.features['solana:signTransaction'];
      if(typeof feature?.signTransaction!=='function')throw Error('Transaction-only signing unavailable');
      const result=await feature.signTransaction({account:current,chain:'solana:mainnet',transaction:Uint8Array.from(Buffer.from(base64,'base64'))});
      if(!(result?.[0]?.signedTransaction instanceof Uint8Array))throw Error('Signed transaction unavailable');
      signed=Buffer.from(result[0].signedTransaction).toString('base64');
    }else{
      if(typeof selected.injected.signTransaction!=='function')throw Error('Transaction-only signing unavailable');
      const result=await selected.injected.signTransaction(Transaction.from(Buffer.from(base64,'base64')));
      signed=Buffer.from(result.serialize({requireAllSignatures:!ownerFirst,verifySignatures:true})).toString('base64');
    }
    if(ownerFirst){const actual=Transaction.from(Buffer.from(signed,'base64')),expected=Transaction.from(Buffer.from(base64,'base64'));if(actual.feePayer.toBase58()!==owner||actual.signatures.length!==2||!actual.signature||!actual.verifySignatures(false)||actual.signatures[1].signature!==null||!actual.serializeMessage().equals(expected.serializeMessage()))throw Error('M4 owner approval changed or missing');}
    assertBound();return signed;
  }};
}
export async function signTestTransaction(base64, expectedOwner) {
  if(window.TekkworkWalletTestOnly)throw Error('Transactions are disabled in this wallet verification environment.');
  if (!active) throw new Error('Reconnect your wallet before signing a devnet transaction');
  const { Transaction, Buffer } = window.TekkworkSDK;
  if (active.standard) {
    const current = active.standard.accounts?.find(a => a.address === expectedOwner);
    if (!current || account.address !== expectedOwner) throw new Error('Reconnect the owner wallet');
    if (!current.chains.includes('solana:devnet')) throw new Error('Wallet does not advertise Solana Devnet for this account. Enable Devnet, disconnect and reconnect before retrying.');
    account = current;
    const feature = active.standard.features['solana:signTransaction'];
    if (!feature) throw new Error('This wallet does not support transaction-only signing. Use Phantom or Solflare.');
    const result = await feature.signTransaction({ account, chain: 'solana:devnet', transaction: Uint8Array.from(Buffer.from(base64, 'base64')) });
    return Buffer.from(result[0].signedTransaction).toString('base64');
  }
  throw new Error('Devnet signing blocked: this connection uses a legacy wallet interface without an explicit network. Open TEKKTEAM in a browser with an updated Wallet Standard-compatible extension, then disconnect and reconnect. Do not bypass wallet security warnings.');
}
// Reuse the canonical connected provider. Sign only; the server owns broadcast.
export async function signFundingTransaction(record, owner, agentWallet, agentId) {
  if(window.TekkworkWalletTestOnly)throw Error('Transactions are disabled in this wallet verification environment.');
  const {Buffer,inspectFundingReview}=window.TekkworkSDK;
  inspectFundingReview(record,owner,agentWallet,agentId);
  if(!active){
    const wallet=registered.find(w=>w.accounts?.some(a=>a.address===owner)&&w.features['solana:signTransaction']);
    if(wallet){active={name:wallet.name,standard:wallet};account=wallet.accounts.find(a=>a.address===owner);watchAccount(active,owner);}
  }
  const wallet=active?.standard,current=wallet?.accounts?.find(a=>a.address===owner),feature=wallet?.features['solana:signTransaction'];
  if(!current?.chains.includes('solana:mainnet')||!feature||account?.address!==owner)throw Error('Reconnect your owner wallet with Mainnet transaction signing support.');
  const state=await request('/state');
  if(state.session?.address!==owner)throw Error('Owner session changed. Reconnect your wallet.');
  const currentReview=await post('/agents/'+encodeURIComponent(agentId)+'/trading/funding/'+encodeURIComponent(record.id)+'/review');
  inspectFundingReview(currentReview,owner,agentWallet,agentId);
  if(currentReview.message!==record.message||currentReview.amountLamports!==record.amountLamports||currentReview.feeLamports!==record.feeLamports)throw Error('Funding quote changed. Review the request again.');
  if(!wallet.accounts?.some(a=>a.address===owner)||active?.standard!==wallet)throw Error('Owner wallet changed before signing.');
  const [signed]=await feature.signTransaction({account:current,chain:'solana:mainnet',transaction:Uint8Array.from(Buffer.from(record.transaction,'base64'))});
  return Buffer.from(signed.signedTransaction).toString('base64');
}
export function walletDiagnostics() {
  const current=active?.standard?.accounts?.find(a=>a.address===account?.address);
  // Advertised chains are capabilities, not the selected network or scanner network.
  return {provider:active?.name || 'Not connected in this page',interface:active?.standard?'Wallet Standard':active?'Legacy injected':'Disconnected',account:current?.address || active?.injected?.publicKey?.toBase58() || null,advertisedChains:current?.chains || [],requestedChain:'solana:devnet',walletActiveNetwork:'not exposed by Wallet Standard',walletSimulation:'not observable by this application',method:'solana:signAndSendTransaction',supportsSigning:!!active?.standard?.features['solana:signAndSendTransaction']};
}
export async function sendTestTransaction(base64,expectedOwner) {
  if(window.TekkworkWalletTestOnly)throw Error('Transactions are disabled in this wallet verification environment.');
  const {config}=await request('/state');
  if(config?.network!=='devnet' || config?.broadcastEnabled!==true || config?.mainnetSafetyMode)throw new Error('Broadcast blocked: requires explicit Devnet backend configuration');
  const wallet=active?.standard;
  const current=wallet?.accounts?.find(a=>a.address===expectedOwner);
  const feature=wallet?.features['solana:signAndSendTransaction'];
  if(!current?.chains.includes('solana:devnet') || !feature)throw new Error('Reconnect a wallet supporting Devnet sign-and-send');
  const {Buffer,Transaction,bs58}=window.TekkworkSDK;
  const bytes=Uint8Array.from(Buffer.from(base64,'base64'));
  if(Transaction.from(bytes).feePayer.toBase58()!==expectedOwner)throw new Error('Payer mismatch');
  const [result]=await feature.signAndSendTransaction({account:current,chain:'solana:devnet',transaction:bytes,options:{skipPreflight:false,preflightCommitment:'finalized',commitment:'confirmed',maxRetries:2}});
  return bs58.encode(result.signature);
}
