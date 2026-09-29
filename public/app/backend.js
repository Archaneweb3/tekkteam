import {walletAuthError} from './wallet-auth-errors.js';
export async function request(path, options = {}) {
  if (window.TekkworkDemo) {
    if (path === '/state' && (!options.method || options.method === 'GET')) return structuredClone(window.TekkworkDemo);
    throw new Error('Client demo only. Wallet login, saving and token issuance require the hosted backend.');
  }
  const response = await fetch((window.TekkworkApiBase||'/api') + path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json().catch(() => ({ error: 'The TEKKTEAM API did not respond. Start the backend and try again.' }));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'),{submissionState:data.submissionState==='REJECTED_BEFORE_BROADCAST'?data.submissionState:undefined,httpStatus:response.status});
  return data;
}
export const post = (path, body = {}, headers = {}) => request(path, { method: 'POST', body: JSON.stringify(body), headers });
const providers = new Map();
const registered = [];
const register = (...wallets) => { for (const wallet of wallets) if (!registered.includes(wallet)) registered.push(wallet); return () => wallets.forEach(w => { const i = registered.indexOf(w); if (i >= 0) registered.splice(i, 1); }); };
window.addEventListener('wallet-standard:register-wallet', e => e.detail({ register }));
window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register } }));
let active = null, account = null;
// Presentation metadata only; session ownership remains server-authoritative.
export function connectedWalletPresentation(owner){
 if(!owner)return null;
 const matched=registered.filter(w=>w.accounts?.some(a=>a.address===owner));
 const selected=active&&(!active.standard||account?.address===owner)?active:matched.length===1?{name:matched[0].name,standard:matched[0]}:window.phantom?.solana?.publicKey?.toBase58()===owner?{name:'Phantom',injected:window.phantom.solana}:null;
 if(!selected)return null;
 const image=selected.standard?.icon||registered.find(w=>w.name===selected.name)?.icon;
 return {name:selected.name||'Wallet provider',icon:typeof image==='string'&&(/^(data:image\/(svg\+xml|png|webp|jpeg);base64,)/i.test(image)||/^https:\/\//i.test(image))?image:null};
}
let stopWatching;
function watchAccount(selected,owner){
 stopWatching?.();
 const changed=async address=>{if(address===owner)return;stopWatching?.();stopWatching=null;active=null;account=null;try{await post('/auth/logout');}finally{window.dispatchEvent(new CustomEvent('tekkwork:wallet-account-changed'));}};
 if(selected.standard?.features['standard:events'])stopWatching=selected.standard.features['standard:events'].on('change',e=>{if(e.accounts)changed(e.accounts.find(a=>a.chains.some(c=>c.startsWith('solana:')))?.address);});
 else if(selected.injected?.on){const handler=key=>changed(key?.toBase58());selected.injected.on('accountChanged',handler);stopWatching=()=>selected.injected.removeListener?.('accountChanged',handler);if(selected.injected.publicKey?.toBase58()!==owner)changed(selected.injected.publicKey?.toBase58());}
}
export function observeExistingWallet(owner){if(!active&&owner&&window.phantom?.solana?.isConnected)watchAccount({injected:window.phantom.solana},owner);}
export function wallets() {
  providers.clear();
  const candidates=[];
  const named=name=>/phantom/i.test(name)?'Phantom':/solflare/i.test(name)?'Solflare':/metamask/i.test(name)?'MetaMask':name;
  registered.forEach((wallet,i)=>{
    if(/trust/i.test(wallet.name||''))return;
    const name=named(wallet.name),features=wallet.features||{},mainnet=wallet.chains?.includes('solana:mainnet')||wallet.accounts?.some(a=>a.chains?.includes('solana:mainnet'));
    const capable=typeof features['standard:connect']?.connect==='function'&&typeof features['solana:signMessage']?.signMessage==='function'&&!!mainnet;
    const mainnetAccount=wallet.accounts?.some(a=>a.chains?.includes('solana:mainnet'));
    const status=!capable?(mainnet?'Solana signing unsupported':'Solana account unavailable'):mainnetAccount?'Ready':'Connect to verify Solana account';
    const id=`standard-${i}`;
    candidates.push({id,brand:name,name,displayName:name,icon:wallet.icon||(name==='Solflare'?'https://www.solflare.com/favicon.ico':null),source:'WALLET_STANDARD',account:wallet.accounts?.find(a=>a.chains?.includes('solana:mainnet'))||null,publicKey:wallet.accounts?.find(a=>a.chains?.includes('solana:mainnet'))?.address||null,chains:wallet.chains||[],features:Object.keys(features),connectionState:mainnetAccount?'CONNECTED':'DISCONNECTED',capabilityState:!capable?(mainnet?'SOLANA_SIGNING_UNSUPPORTED':'SOLANA_ACCOUNT_UNAVAILABLE'):mainnetAccount?'READY':'CONNECT_TO_VERIFY_SOLANA_ACCOUNT',status,selectable:capable,probeAvailable:capable,priority:capable?3:0,adapter:capable?{name,standard:wallet}:null});
  });
  if(window.phantom?.solana?.isPhantom===true){
    const injected=window.phantom.solana,capable=typeof injected.connect==='function'&&typeof injected.signMessage==='function';
    candidates.push({id:'phantom',brand:'Phantom',name:'Phantom',displayName:'Phantom',icon:registered.find(w=>/phantom/i.test(w.name))?.icon||injected.icon||null,source:'WINDOW_PHANTOM_SOLANA',account:null,publicKey:injected.publicKey?.toBase58()||null,chains:['solana:mainnet'],features:['connect','signMessage'],connectionState:injected.isConnected?'CONNECTED':'DISCONNECTED',capabilityState:capable?'CONNECT_TO_VERIFY_SOLANA_ACCOUNT':'SOLANA_SIGNING_UNSUPPORTED',status:capable?'Connect to verify Solana account':'Solana signing unsupported',selectable:capable,probeAvailable:capable,priority:capable?2:0,adapter:capable?{name:'Phantom',injected}:null});
  }
  if(window.solflare?.isSolflare===true){
    const injected=window.solflare,capable=typeof injected.connect==='function'&&typeof injected.signMessage==='function';
    candidates.push({id:'solflare',brand:'Solflare',name:'Solflare',displayName:'Solflare',icon:registered.find(w=>/solflare/i.test(w.name))?.icon||injected.icon||'https://www.solflare.com/favicon.ico',source:'WINDOW_SOLFLARE',account:null,publicKey:injected.publicKey?.toBase58()||null,chains:['solana:mainnet'],features:['connect','signMessage'],connectionState:injected.isConnected?'CONNECTED':'DISCONNECTED',capabilityState:capable?'CONNECT_TO_VERIFY_SOLANA_ACCOUNT':'SOLANA_SIGNING_UNSUPPORTED',status:capable?'Connect to verify Solana account':'Solana signing unsupported',selectable:capable,probeAvailable:capable,priority:capable?2:0,adapter:capable?{name:'Solflare',injected}:null});
  }
  if(!candidates.some(wallet=>wallet.brand==='Solflare'&&wallet.selectable))candidates.push({id:'solflare-unavailable',brand:'Solflare',name:'Solflare',displayName:'Solflare',icon:'https://www.solflare.com/favicon.ico',source:'OFFICIAL_INSTALL',account:null,publicKey:null,chains:[],features:[],connectionState:'NOT_INSTALLED',capabilityState:'NOT_INSTALLED',status:'Not installed',selectable:false,probeAvailable:false,priority:-1,adapter:null,installUrl:'https://www.solflare.com/download/'});
  if(window.ethereum?.isMetaMask)candidates.push({id:'metamask-evm',brand:'MetaMask',name:'MetaMask',displayName:'MetaMask',icon:registered.find(w=>/metamask/i.test(w.name))?.icon||null,source:'EVM_FALLBACK',account:null,publicKey:null,chains:[],features:[],connectionState:'DISCONNECTED',capabilityState:'SOLANA_ACCOUNT_UNAVAILABLE',status:'Solana account unavailable',selectable:false,probeAvailable:false,priority:-1,adapter:null});
  const chosen=new Map();
  for(const candidate of candidates){const key=candidate.brand.toLowerCase();if(!chosen.has(key)||candidate.priority>chosen.get(key).priority)chosen.set(key,candidate);}
  return [...chosen.values()].filter(row=>['Phantom','Solflare','MetaMask'].includes(row.brand)).sort((a,b)=>['Phantom','Solflare','MetaMask'].indexOf(a.brand)-['Phantom','Solflare','MetaMask'].indexOf(b.brand)).map(({priority,adapter,...row})=>{if(adapter)providers.set(row.id,adapter);return row;});
}
const providerSource=selected=>selected.standard?'WALLET_STANDARD':selected.injected===window.phantom?.solana?'WINDOW_PHANTOM_SOLANA':selected.injected===window.solflare?'WINDOW_SOLFLARE':'UNKNOWN';
const providerContext=(selected,owner,messageByteLength)=>({source:providerSource(selected),phantom:/^phantom$/i.test(selected.name),isPhantom:selected.injected?selected.injected.isPhantom===true:undefined,publicKey:owner,messageByteLength});
const providerError=(code,stage)=>Object.assign(Error(code),{walletAuthCode:code,walletAuthStage:stage});
function assertProviderBinding(id,selected,owner,connectedAccount){
 if(providers.get(id)!==selected||selected.standard&&!registered.includes(selected.standard)||selected.injected&&selected.name==='Phantom'&&window.phantom?.solana!==selected.injected||selected.injected&&selected.name==='Solflare'&&window.solflare!==selected.injected)throw providerError('PROVIDER_MISMATCH','SIGN_MESSAGE');
 if(selected.standard&&connectedAccount?.address!==owner||selected.injected&&selected.injected.publicKey?.toBase58()!==owner)throw providerError('PROVIDER_MISMATCH','SIGN_MESSAGE');
 if(selected.standard&&(!connectedAccount.chains?.includes('solana:mainnet')||selected.standard.accounts?.length>0&&!selected.standard.accounts.some(a=>a.address===owner&&a.chains?.includes('solana:mainnet'))))throw providerError('PROVIDER_MISMATCH','SIGN_MESSAGE');
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
export async function connect(id) {
  const selected = providers.get(id); if (!selected) throw new Error('Wallet is no longer available. Reopen the connection dialog.');
  const step=async(stage,action)=>{try{return await action();}catch(error){throw walletAuthError(stage,error);}};
  let owner;
  if (selected.standard) {
    const result = await step('PROVIDER_CONNECT',()=>selected.standard.features['standard:connect'].connect());
    account = await step('PUBLIC_KEY',()=>result.accounts?.find(a => a.chains?.includes('solana:mainnet')));
    if (!account) throw providerError('SOLANA_ACCOUNT_UNAVAILABLE','PUBLIC_KEY');
    owner = account.address;
  } else { await step('PROVIDER_CONNECT',()=>selected.injected.connect()); owner = await step('PUBLIC_KEY',()=>selected.injected.publicKey.toBase58()); }
  try{if(window.TekkworkSDK.bs58.decode(owner).length!==32)throw Error('Invalid Solana account');}catch{throw providerError('SOLANA_ACCOUNT_UNAVAILABLE','PUBLIC_KEY');}
  const challenge = await step('AUTH_CHALLENGE',()=>post('/auth/challenge', { address: owner }));
  const {signature}=await signSelected(id,selected,owner,account,challenge.message);
  await step('VERIFY',()=>post('/auth/verify', { id: challenge.id, signature: window.TekkworkSDK.bs58.encode(signature) }));
  await step('SESSION',()=>{active = selected;watchAccount(selected,owner);});return owner;
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
  stopWatching?.();stopWatching=null;
  await post('/auth/logout');
  try { if (active?.standard) await active.standard.features['standard:disconnect']?.disconnect(); else await active?.injected?.disconnect(); } catch {}
  active = null; account = null;
}
export async function signTestTransaction(base64, expectedOwner) {
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
