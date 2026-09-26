// Public identifiers only. Private RPC credentials belong exclusively in server env.
const freeze = value => { for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child); return Object.freeze(value); };
export const NETWORKS = freeze({
  DEVNET: {
    mode: 'DEVNET', network: 'devnet', walletChain: 'solana:devnet', phantomChain: 'solana:103',
    rpc: 'https://api.devnet.solana.com', genesis: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
    explorer: 'https://explorer.solana.com', explorerQuery: '?cluster=devnet',
    programs: { memo: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' }, mints: {}, tokenAccounts: {},
  },
  MAINNET: {
    mode: 'MAINNET', network: 'mainnet', walletChain: 'solana:mainnet', phantomChain: 'solana:101',
    rpc: 'https://api.mainnet-beta.solana.com', genesis: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
    explorer: 'https://explorer.solana.com', explorerQuery: '',
    // Candidate canonical Memo address is verified executable on this cluster before every smoke test.
    programs: { memo: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' }, mints: {}, tokenAccounts: {},
    safetyMode: true, broadcastEnabled: false, valueMovementEnabled: false,
    maxFeeLamports: 100000, reserveLamports: 1000000,
  },
});
export function networkConfig(mode) {
  const config = NETWORKS[String(mode).toUpperCase()];
  if (!config) throw new Error('Network must be explicitly DEVNET or MAINNET');
  return config;
}
export function explorerUrl(mode, kind, address) {
  if (!['address', 'tx'].includes(kind)) throw new Error('Invalid explorer resource');
  const c = networkConfig(mode);
  return `${c.explorer}/${kind}/${encodeURIComponent(address)}${c.explorerQuery}`;
}
export function backendNetwork(env) {
  const mode = env.SOLANA_NETWORK || env.CHAIN_MODE || 'local';
  if (mode === 'local') return { network: 'local', rpc: undefined, safetyMode: false };
  const c = networkConfig(mode);
  if (c.mode === 'MAINNET' && env.MAINNET_SAFETY_MODE !== 'true') throw new Error('MAINNET requires MAINNET_SAFETY_MODE=true; broadcasting is not implemented');
  return { network: c.network, safetyMode: c.mode === 'MAINNET',
    rpc: c.mode === 'MAINNET' ? (env.SOLANA_MAINNET_RPC_URL || c.rpc) : (env.SOLANA_DEVNET_RPC_URL || env.SOLANA_RPC_URL || c.rpc) };
}
