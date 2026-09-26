# ADR-010: Independent workspace UI and fail-closed development backend

## Status

Accepted for local development. Supersedes ADR-009's reference layout and snapshot runtime; retains its voxel characters and office scene.

## Date

2026-09-26

## Context

The user requested a TEKKWORK backend and original English content/layout for copied statistics, rankings, activity and agent cards. No hosting credentials, mainnet policy or RPC configuration was supplied. Reference balances are not TEKKWORK activity.

## Decision

Use a separate Express process, Node SQLite persistence, single-use wallet-signature challenges and owner-scoped records. Default to local drafting. Devnet minting asks the creator wallet to sign; only a randomly generated mint key is stored encrypted with AES-256-GCM. No funded custodial agent wallet is exposed. This narrows the initially contemplated custodial-wallet backend to a testable development increment.

RPC genesis validation constrains minting to devnet. Persist the deterministic signature before submission; only RPC confirmation produces success. Signed messages must exactly match prepared payer, mint, amount and authority instructions. An unresolved submission cannot create another mint. Strategy profiles persist but do not execute.

The new interface uses horizontal navigation, editorial office hero, four honest metrics, private fleet cards and an event log. No podium, phone-shaped payroll cards, price marquee or borrowed financial records. English copy distinguishes available and unimplemented capabilities.

## Alternatives considered

- Reference snapshots: rejected as they imply another product's activity is TEKKWORK's.
- Immediate custodial mainnet launch/trading: deferred pending implementation, security review, deployment and live tests. It is not a configuration toggle.
- PostgreSQL: appropriate for production/multiple workers, but unnecessary for a useful local persistence/auth increment.
- Renderer rewrite: unnecessary; preserve the approved recognizable office and original crew.

## Consequences

- Both frontend and backend must run. Static Vercel hosting cannot persist this database.
- Database/vault backups, secure deployment and production abuse controls are required.
- No AI execution, mainnet launch, market data or fee collection is claimed.
- The Solana dependency tree has audit advisories. See the release checklist.
