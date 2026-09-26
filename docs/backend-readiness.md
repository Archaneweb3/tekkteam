# Backend readiness and release blockers

## Verified locally (2026-09-26)

- Signature challenges, replay/origin rejection, session expiry/logout.
- Owner-scoped records and events, validation and cross-owner denial.
- Database restart persistence and encrypted mint keys bound to agent IDs.
- Draft idempotency, duplicate-submission protection and explicit confirmation states.
- Real Solana transaction encoding with injected RPC, tampered-instruction rejection and wrong-genesis rejection.
- Authenticated browser test: wallet fixture signs a challenge, saves draft, updates profile, reloads, searches, logs out. Uses disposable database, not user records.
- Six routes at 320/390/768/1440px, office and character WebGL, no horizontal overflow or page errors.
- No real wallet-extension transaction, live-network mint, mainnet spending or public deployment performed.

## Before devnet end-to-end use

Local configuration now targets the public Solana devnet RPC. Use a dedicated wallet with test SOL. Verify extension/mobile approvals and explorer confirmation before claiming end-to-end readiness. Pending submissions are stored encrypted and checked every 15 seconds; the identical signed transaction can be rebroadcast until confirmed or expired by finalized block height. Do not use a valuable mainnet wallet for development.

## Before production financial use

1. Implement mainnet launch separately: metadata, transaction validation, fee/slippage/spend caps, simulation, durable jobs and reconciled custody/noncustody policy.
2. Implement actual agent inference/execution, market data, risk limits, stops and operator kill switch. Profiles are not an AI trader.
3. Resolve dependency advisories. `npm audit --omit=dev` reports 9 (3 high, 6 moderate) in legacy Solana dependencies: bigint-buffer / buffer-layout-utils / spl-token and jayson / stream-json / uuid / web3.js. Do not blindly apply suggested ancient SDK downgrades. Evaluate maintained SDKs or reviewed compatible patches, then rerun transaction tests.
4. Persistent storage, TLS, secure cookies, secret-managed vault key, enforced ACLs, encrypted backups, monitoring and log redaction. SQLite is single-instance; horizontal workers require migration/distributed locking.
5. Production abuse controls beyond per-wallet draft quotas, correctly configured proxy rate limits, independent security review and recovery procedures.
6. Load-test the local durable replay/recovery mechanism under provider outages and process crashes before production. Never create another mint merely because a request timed out.
7. Product claims and network labels must match deployed capabilities. Never reinstate reference balances as TEKKWORK records.

## Deployment boundary

Vite builds the frontend; static Vercel output does not run Express or persist SQLite. Provide a persistent server/reverse proxy or redesign for a serverless database/API. Mainnet is blocked in code, not awaiting a hidden flag. No deployment was requested for this increment.
