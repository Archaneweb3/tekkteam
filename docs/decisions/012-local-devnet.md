# Local devnet launch

Status: Accepted
Date: 2026-09-26

## Context
The user requested a local devnet setup without a paid RPC or public backend.

## Decision
Use the public Solana devnet endpoint and validate its complete genesis hash. Quote mint rent, token-account rent and transaction fees before requesting a wallet signature; reject insufficient test SOL. Persist signed submissions encrypted before broadcasting. Reconcile every 15 seconds and rebroadcast only the identical transaction. Determine expiry using finalized block height and a second signature lookup, not wall-clock time.

## Consequences
This issues a basic SPL test token, not a pump.fun launch, liquidity pool, metadata account or autonomous trading agent. Public RPC availability and faucet limits are external dependencies. The backend stays loopback-only and mainnet remains disabled. Wallet-extension approval and a confirmed live devnet mint still require end-to-end validation.

## Local use
Run `npm run server` and `npm run dev -- --port 5188`. Connect a dedicated test wallet, obtain test SOL from https://faucet.solana.com/, save an agent draft and choose the devnet mint action. Keep the API running for confirmation recovery. Never share private keys.

Readiness: `GET /api/network`; authenticated test balance: `GET /api/wallet`. Neither endpoint exposes RPC credentials.
