# 051 — One server-side Mainnet authority for real-money paths

## Context

The application shell still uses `CHAIN_MODE=devnet` for its legacy Devnet chain. Funding and withdrawal had nevertheless been verified on Solana Mainnet because those paths created independent Mainnet RPC connections. The Controlled Real CPMM path created another. A Devnet application label is therefore not proof that the real-money runtime is Devnet, but independently configured clients made a future split-network regression possible.

## Decision

Keep the application network label truthful and separate from `realMoneyNetwork`. The server creates one authoritative real-money `Connection` from `MAINNET_RPC_URL` (or the canonical public Mainnet endpoint) and passes that same object to Agent Wallet balance, Funding, Withdrawal, CPMM state, blockhash, simulation, broadcaster, and reconciliation. `REAL_MONEY_NETWORK` may only be `MAINNET`; conflicting Mainnet RPC configuration is rejected. The real-money authority verifies the canonical Mainnet genesis at startup and before a Controlled Real prepare. The adapter verifies again before each later blockheight, simulation, signing, broadcast, and reconciliation boundary. A mismatched or unavailable authority fails closed before the DEX ledger receives a quote or reservation. The wallet transfer and balance paths use the same authority.

Health now reports the legacy `applicationNetwork` separately from non-secret real-money network readiness and each role. `network=devnet` is not cosmetically rewritten. All role labels become Mainnet only after the single-connection topology and genesis proof succeeds; they revert to unavailable on a failed recheck. A startup failure leaves Paper available but Controlled Real unavailable.

## Consequences

The current local app may truthfully report Devnet while its independently guarded real-money subsystem reports verified Mainnet. Funding, Withdrawal, Controlled Real, Live, and signer/broadcaster latches remain disabled until separately authorized. No DEX execution or reservation is created by startup verification. Tests inject split role connections and wrong genesis to prove a Controlled Real prepare fails before ledger mutation.
