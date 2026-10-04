# 084 — Phase A additive identity and projection contracts

## Status

Implemented in local source, 2026-09-30; not deployed. Supersedes only the implementation-gap statements in 082/083, not their policy boundaries.

## Context

Future Launch UI needs identity-only writes, effective strategy metadata and read models. Existing Mainnet Agent middleware intentionally blocks combined mint/draft/transaction actions; Pump receipts live outside SQLite. Legacy Agent secret is NOT NULL, migrated V2 nullable.

## Decision

Add `/api/agent-identities` instead of loosening `/api/agents` middleware. Validate owner/session/origin, identity-only fields and supported character/profile, cap count, bind idempotency to immutable input. No Keypair/mint/custody/launch/Paper side effect. Nullable legacy upgrade occurs only on explicit write, not process startup; V2 no-op. Preserve ciphertext/rows/FKs/schema objects and historical sequence; unknown layouts fail closed.

Expose version1 registry and owner-only Operating Plan/lifecycle/Agent contracts. Keep existing IDs, one algorithm and separate execution authorization. Correct descriptive exposure to active default/ceiling10%, no new Risk policy. Missing separate risk revision returns null. Pump canonical title-case receipt statuses map to read states; signed uncertain outcomes require reconciliation. Disk-only PREPARED review validity is UNVERIFIED, never permission. Read does not modify receipt/expiry or perform RPC.

Public foundation is a pure explicitly owner-bound opt-in projection function, confirmed Mainnet receipt only, enumerated safe fields. No public route, automatic publication or new publication storage. Full immutable registry/risk revision stores and Launch UX remain TARGET.

## Consequences

No Phase B/C/D UI, feature flag, execution port, custody migration or production change. Tests use temporary DBs and fixture network/auth/transactions; no real wallet material or broadcast. Legacy combined creation/auth/Paper regression remains required. Local persistent DBs and production were not opened for mutation.
