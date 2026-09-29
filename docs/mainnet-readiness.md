# TEKKWORK Mainnet readiness — 2026-09-26

Follow-up: the local browser transport blocker was subsequently fixed. See [Mainnet transport evidence](mainnet-transport-edge-2026-09-26.md) for the successful RPC checks, Phantom response and unexpected provider resolution/cancellation exception. The initial pass below is retained as historical context; production remains blocked.

Status: **NOT production-ready. Mainnet RPC smoke PASS; Phantom Mainnet preview NOT TESTED.** No deployment, transaction approval or broadcast was performed.

## Configuration and safety boundary

`src/networks.js` separates DEVNET and MAINNET, including genesis, RPC, Wallet Standard chain, expected Phantom identifier and explorer URL. Mainnet has no token mint/account or launch/trading program registry. Only canonical Memo is a candidate and must be independently verified executable on Mainnet before use.

For a separately operated backend, set SOLANA_NETWORK=MAINNET, MAINNET_SAFETY_MODE=true, SOLANA_MAINNET_RPC_URL to the approved server-side Mainnet RPC, a separate DATA_DIR and PORT. Default Mainnet data directory is server/data/mainnet-safety. Legacy SOLANA_RPC_URL is never inherited by Mainnet. Existing environment and running Devnet backend were not switched. Never expose credential-bearing RPC URLs or vault/signing keys to browser variables.

Mainnet blocks all /api/agents writes and worker reconciliation. The read-only adapter has no submission method. GET /api/safety/memo?address=PUBLIC_KEY verifies genesis, system-owned payer balance, executable Memo, fresh blockhash, fee budget and exact unsigned memo simulation, returning public diagnostic evidence. It does not sign or broadcast. Invalid requests fail closed. Mainnet auth may sign a login message, not a transaction; the isolated diagnostic instead reconnects an already-trusted Phantom account without backend auth.

Local diagnostic: http://127.0.0.1:5188/mainnet-diagnostic.html . It uses signTransaction only, a fixed Memo and one preview per page. Both transaction hashes must match before the provider call. The user must manually select Mainnet; advertised wallet capabilities do not prove selected network. No automatic network switching. Never approve; cancel each preview. This diagnostic is deliberately excluded from the production build.

## Verified read-only smoke

- Time: 2026-09-26T12:20:33.275Z
- RPC: https://api.mainnet-beta.solana.com
- Genesis: 5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d
- Payer/public wallet: ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS
- Wallet exists, system-owned; balance 17,664,446 lamports (0.017664446 SOL), slot 450672827.
- MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr verified executable, slot 450672826.
- Blockhash: uRhwcgZ4TnH1SAVpLBPmeSbcryFu14ukGsYF4TbiGd9; lastValidBlockHeight 428712749. Historical, not reusable.
- One unsigned Memo, no instruction account metas, one required signer, no transfers/token instructions.
- Fee quote and simulation fee: 5,000 lamports; units consumed: 20,455; simulation err=null at slot 450672828. sigVerify=false, replaceRecentBlockhash=false.
- Logs: Memo invoke [1]; Memo (len 53): "TEKKWORK MAINNET SAFETY: preview only; do not approve"; consumed 20455 of 200000 compute units; success.

## Edge result and blocker

User manually disabled Testnet Mode. Edge Phantom showed the same account's 0.01766 SOL balance. The new diagnostic reconnected, but direct browser RPC returned HTTP 403. The page stopped before signTransaction. Therefore **no Mainnet Phantom simulation response, payload chainId, transformed hash or safe-preview result is available**. Expected solana:101 is configuration, not an observed request. Phantom upstream state remains UNKNOWN. Do not infer resolution of the Devnet safeguard error.

Next: configure an approved browser-compatible Mainnet RPC or a secured read-only backend transport; repeat one fresh memo preview and cancel, capturing extension request/response. Report that result before any decision about broadcast. Do not use a generic unrestricted RPC proxy.

## Codebase audit

Scanned source, server, public assets, scripts, tests and documentation for devnet, solana:103 and api.devnet. Excluded generated node_modules/dist/.git and secret environment contents. Existing database outputs are not a Mainnet address source.

| Area | Findings / disposition |
|---|---|
| src/networks.js | Intentional separate Devnet and Mainnet identifiers. |
| server/chain.js | Devnet genesis, SPL mint/ATA construction and sendRawTransaction intentionally remain Devnet-only; never imported by Mainnet adapter. |
| server/app.js, config.js, index.js | Network guards, isolated Mainnet adapter/database, disabled mutation/reconciliation; no migration of Devnet agents/accounts. |
| public/app/backend.js | Legacy Devnet sign-and-send remains for Devnet; now requires explicit Devnet backend broadcast permission. Mainnet diagnostic has no send path. |
| public/app/workspace.js, overview.js | Devnet mint labels/explorer links remain tied to the existing Devnet product. Mainnet safety banner added; full Mainnet product copy/UX still a release blocker. |
| src/bootstrap.js, index.html | Production is still a client demo, not a live Mainnet application. No deployment configuration switched. |
| src/phantom-diagnostic.js, phantom-diagnostic.html, scripts/phantom-* | Historical Devnet diagnostics intentionally retained unchanged. |
| scripts/devnet-smoke.mjs | Can broadcast Devnet transactions; not run during this pass, not a Mainnet tool. |
| public/app/pages/skins.js, legacy pages/main.js, public/preview-config.json and reference snapshots | Legacy/reference content is not a verified Mainnet registry. No addresses imported into Mainnet configuration. Must be quarantined/removed or audited before production activation. |
| tests, .env.example, README, docs | Intentional Devnet fixtures/history/config examples retained, not globally replaced. |

No custom program/mint/token account was independently verified for Mainnet; none is enabled. Token issuance, pump.fun, trading, metadata and liquidity remain unavailable. A complete production pass still requires integration-specific program/account verification, transport reliability, server deployment/security/monitoring, UI cleanup, and separately authorized transaction execution.

## Verification

Backend regression tests: 11 passed. Mainnet safety tests cover explicit mode, RPC separation, empty registries, exact unsigned memo, rejection of wrong cluster/accounts/fee/simulation, blocked broadcast RPC methods, blocked backend mutations and DB network binding. Production build passes and remains demo-only. Existing Devnet evidence/report was not edited.

References: [Solana clusters](https://solana.com/docs/references/clusters), [getGenesisHash](https://solana.com/docs/rpc/http/getgenesishash). Public RPC availability is not a production SLA.
