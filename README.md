# TEKKWORK workspace

An original blue agent workspace with a retained WebGL office, six voxel characters, wallet authentication, private persistent drafts and a devnet-only test-token implementation. This is a local development release, not a production financial service or autonomous AI trader. Reference balances are no longer loaded by the active application.

## Run (Node 22.13+)

```powershell
npm install
npm run server
```

In a second terminal, run `npm run dev -- --port 5188 --strictPort`. Open `http://127.0.0.1:5188/#/`. Port 5173 belongs to another prototype. Vite proxies `/api` to port 4190; both processes are required. The API uses Node's SQLite (experimental in Node 22).

Default `CHAIN_MODE=local` supports sign-in and persisted drafts, with no blockchain writes. For test-token issuance, configure private `.env` from `.env.example`: `CHAIN_MODE=devnet` and `SOLANA_RPC_URL` pointing to devnet. Restart the backend. The RPC genesis hash must match devnet; mainnet is rejected. Use a dedicated wallet with devnet SOL.

## Commands

- `npm run server`: local Express API and database.
- `npm run test:backend`: isolated authentication, authorization, persistence and transaction tests.
- `npm test`: backend and browser tests; requires frontend/API running.
- `npm run build`: frontend bundle in `dist/`; does not start or deploy the backend.

## Architecture and limits

- Active frontend: `src/bootstrap.js`, `public/app/workspace.js`, `public/app/backend.js`, `public/workspace.css`. Existing 3D modules provide the office and characters; old recovered pages are unused rollback context.
- Backend: `server/app.js` (API/auth), `server/store.js` (SQLite/AES-256-GCM), `server/chain.js` (devnet-only minting). Drafts/events are scoped to the authenticated wallet.
- Devnet minting creates 1,000,000 test tokens with six decimals and revoked mint authority. The owner signs the exact transaction. It does not create metadata, liquidity or a pump.fun listing. Tests use injected RPC; no live-network transaction has been performed.
- Mainnet launch, AI inference, autonomous trading, market data, creator fees, withdrawals and paid NFTs are not implemented. They need additional implementation and verification, not just credentials. Strategy profiles are saved settings, not executing algorithms.
- `scripts/sync-reference.mjs` recovers public resources to `.reference/bagwork` with a hash manifest. `--config` refreshes the local preview configuration. `--apply` intentionally resets interface modules; do not use it for routine updates.
- `scripts/render-brand.mjs` renders raster assets directly from the custom WebGL/SVG models. Set `BASE_URL` for another preview port.
- `public/demo-state.json`, `public/demo-agents/`, and the old `api.js` / `wallet.js` are not loaded by the new entry point. The UI never substitutes sample balances when the API is offline.
- The original earlier TEKKTEAM 3D prototype remains in Git history at commit `46d925c`. A prior in-progress redesign was saved in Git stash before this adaptation.

## Storage and hosting

Records live in ignored `server/data/`. Back up the database and `vault.key` together; losing the key loses access to stored mint keys. Development requests restrictive file permissions, but Windows directory ACLs must also be enforced. Production requires a secret-manager-provided `VAULT_KEY_BASE64`; it never creates a fallback key.

This single-process SQLite API requires a persistent server/disk. A static Vercel deployment alone cannot run it. Use TLS, same-origin `/api` reverse proxying, exact `APP_ORIGINS` and secure cookies. API binds loopback by default. Never upload `.env`, `server/data` or wallet secrets.

Read [ADR-010](docs/decisions/010-workspace-backend.md), [API contract](docs/api.md) and [release blockers](docs/backend-readiness.md). There are unresolved dependency advisories; this is not production-ready for real funds.
