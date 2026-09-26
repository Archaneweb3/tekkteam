import { PublicKey } from '@solana/web3.js';
import { networkConfig } from '../src/networks.js';
import { readOnlyRpc, prepareMainnetMemo } from '../src/mainnet-safety.js';
export function mainnetSafetyChain(endpoint) {
  const rpc = readOnlyRpc(endpoint), c = networkConfig('MAINNET');
  const verify = async () => { if (await rpc('getGenesisHash') !== c.genesis) throw new Error('Wrong Mainnet RPC'); };
  return Object.freeze({
    async health() { await verify(); return {ready:true,network:'mainnet',safetyMode:true,broadcastEnabled:false}; },
    async wallet(address) { await verify(); const balance = await rpc('getBalance',[new PublicKey(address).toBase58(),{commitment:'finalized'}]);return {network:'mainnet',balanceSol:balance.value/1e9,safetyMode:true}; },
    async prepareMemo(address) { return prepareMainnetMemo(address,rpc); },
    // No submit/send/status/rebroadcast capability is present.
  });
}
