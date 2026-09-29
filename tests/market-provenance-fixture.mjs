import {snapshot as poolSnapshot} from './cpmm-envelope-fixture.mjs';
import {resolveMarketProvenance} from '../server/dex/market-provenance.js';
import {CONTROLLED_CPMM_POOL,CONTROLLED_USDC_MINT} from '../server/dex/cpmm-mainnet-state.js';
import {SOL_MINT} from '../server/dex/intent.js';

export const fixtureMarket=(now,snapshotId='market-1')=>({network:'solana:101',mint:CONTROLLED_USDC_MINT,tokenMint:CONTROLLED_USDC_MINT,baseMint:SOL_MINT,quoteMint:CONTROLLED_USDC_MINT,pair:CONTROLLED_CPMM_POOL,venue:'raydium',source:'Dexscreener',priceUsd:1,solUsd:100,liquidityUsd:100000,volume5m:10000,change5m:4,buys5m:10,sells5m:2,observedAt:now-1000,snapshotId});
export const fixturePoolVerification=async()=>({pool:CONTROLLED_CPMM_POOL,slot:poolSnapshot.slot,snapshot:poolSnapshot});
export const fixtureProvenance=(snapshot,agentWallet,now)=>resolveMarketProvenance({snapshot,mint:snapshot.mint,agentWallet,now:()=>now,verifyPool:fixturePoolVerification});
