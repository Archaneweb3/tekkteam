export async function request(path, options = {}) {
  if (window.TekkworkDemo) {
    if (path === '/state' && (!options.method || options.method === 'GET')) return structuredClone(window.TekkworkDemo);
    throw new Error('Client demo only. Wallet login, saving and token issuance require the hosted backend.');
  }
  const response = await fetch((window.TekkworkApiBase||'/api') + path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json().catch(() => ({ error: 'The TEKKWORK API did not respond. Start the backend and try again.' }));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
export const post = (path, body = {}, headers = {}) => request(path, { method: 'POST', body: JSON.stringify(body), headers });
const providers = new Map();
const registered = [];
const register = (...wallets) => { for (const wallet of wallets) if (!registered.includes(wallet)) registered.push(wallet); return () => wallets.forEach(w => { const i = registered.indexOf(w); if (i >= 0) registered.splice(i, 1); }); };
window.addEventListener('wallet-standard:register-wallet', e => e.detail({ register }));
window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register } }));
let active = null, account = null;
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
  registered.filter(w => w.features['solana:signMessage']).forEach((w, i) => providers.set(`standard-${i}`, { name: w.name, standard: w }));
  if (window.phantom?.solana && !registered.some(w => /phantom/i.test(w.name))) providers.set('phantom', { name: 'Phantom', injected: window.phantom.solana });
  if (window.solflare && !registered.some(w => /solflare/i.test(w.name))) providers.set('solflare', { name: 'Solflare', injected: window.solflare });
  return [...providers].map(([id, w]) => ({ id, name: w.name }));
}
export async function connect(id) {
  const selected = providers.get(id); if (!selected) throw new Error('Wallet is no longer available. Reopen the connection dialog.');
  let owner;
  if (selected.standard) {
    const result = await selected.standard.features['standard:connect'].connect();
    account = result.accounts.find(a => a.chains.some(c => c.startsWith('solana:')));
    if (!account) throw new Error('Select a Solana account in your wallet');
    owner = account.address;
  } else { await selected.injected.connect(); owner = selected.injected.publicKey.toBase58(); }
  const challenge = await post('/auth/challenge', { address: owner });
  const message = new TextEncoder().encode(challenge.message);
  const signature = selected.standard
    ? (await selected.standard.features['solana:signMessage'].signMessage({ account, message }))[0].signature
    : (await selected.injected.signMessage(message, 'utf8')).signature;
  await post('/auth/verify', { id: challenge.id, signature: window.TekkworkSDK.bs58.encode(signature) });
  active = selected;watchAccount(selected,owner);return owner;
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
  throw new Error('Devnet signing blocked: this connection uses a legacy wallet interface without an explicit network. Open TEKKWORK in a browser with an updated Wallet Standard-compatible extension, then disconnect and reconnect. Do not bypass wallet security warnings.');
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
