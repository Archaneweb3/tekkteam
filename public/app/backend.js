export async function request(path, options = {}) {
  if (window.TekkworkDemo) {
    if (path === '/state' && (!options.method || options.method === 'GET')) return structuredClone(window.TekkworkDemo);
    throw new Error('Client demo only. Wallet login, saving and token issuance require the hosted backend.');
  }
  const response = await fetch('/api' + path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
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
  active = selected; return owner;
}
export async function disconnect() {
  await post('/auth/logout');
  try { if (active?.standard) await active.standard.features['standard:disconnect']?.disconnect(); else await active?.injected?.disconnect(); } catch {}
  active = null; account = null;
}
export async function signTestTransaction(base64, expectedOwner) {
  if (!active) throw new Error('Reconnect your wallet before signing a devnet transaction');
  const { Transaction, Buffer } = window.TekkworkSDK;
  if (active.standard) {
    if (account.address !== expectedOwner) throw new Error('Reconnect the owner wallet');
    const feature = active.standard.features['solana:signTransaction'];
    if (!feature) throw new Error('This wallet does not support transaction-only signing. Use Phantom or Solflare.');
    const result = await feature.signTransaction({ account, chain: 'solana:devnet', transaction: Uint8Array.from(Buffer.from(base64, 'base64')) });
    return Buffer.from(result[0].signedTransaction).toString('base64');
  }
  if (active.injected.publicKey?.toBase58() !== expectedOwner) throw new Error('Reconnect the owner wallet');
  return (await active.injected.signTransaction(Transaction.from(Buffer.from(base64, 'base64')))).serialize().toString('base64');
}
