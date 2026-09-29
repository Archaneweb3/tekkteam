# 041 — Production evidence is not route authorization

## Context

Credentials permit Jupiter Mainnet V2 `/build` requests. Three real unsigned
samples contain `route_v2` / `shared_accounts_route_v2` discriminator candidates,
multiple CPI programs and ALTs. The older published CPI IDL does not establish
these V2 semantics. Decoding/simulation success is not complete value-flow proof.

## Decision

Preserve ADR 039/040's disabled execution boundary. Startup rejects attempted
Controlled Real enable even with credentials until the route gate is approved.
A key enables economic data only. No production signer/broadcaster is installed.

Keep sanitized real instructions and public RPC table snapshots. Resolve ALTs
from independently verified Mainnet RPC, never provider contents. Check owner,
active/stable state, indexes and complete keys. Independently derive classic SPL
ATAs and inspect mints, token owners, state, delegates and close authorities.
Unsupported layouts/extensions and nonzero existing WSOL fail closed. Pool roles
remain unapproved until established by a pinned route decoder.

Validate canonical WSOL setup/cleanup independently: Agent funding of exact input,
SyncNative, derived ATA and close back to Agent. Output ATA creation after sync is
observed; unrelated transfers remain forbidden. Setup success does not approve a
route. Temporary/shared custody is unsupported. Versioned CPI policy
`observed-v1-deny-all` intentionally approves no route programs/discriminators.

## Shared reservation boundary

`real-balance-reservations.js` owns persisted wallet locks. A SQLite writer-lock
acquisition precedes conflict checks; savepoints compose with existing request
transactions. Reservations and records commit or roll back together. Operations
serialize per wallet, including incoming FUND: unconfirmed credit is never spent.
Pre-upgrade active records without reservation rows still block other operations.

The only frozen wallet integration is its record-save boundary; construction,
custody, authentication, signing and broadcasting semantics are unchanged. DEX
reserves at PREPARED. Same intent reuses its lock; intent/resource/signature
mutation and downgrade reject. SIGNED/SUBMITTED/UNKNOWN retain locks until trusted
terminal reconciliation. Unsigned terminal rejection releases; confirmed records
retain settlement evidence. Future Live must use this service explicitly. Separate
databases/distributed deployments are not coordinated by this SQLite design.

## Reserve and accounting

Protected SOL = 2,000,000 safety + 10,000 future SELL fee + 10,000 reconciliation
margin = 2,020,000 lamports. Current swap fee (ceiling 10,000), peak upfront ATA
rent and input are additional. BUY cap remains 1,000,000. These are guardrails,
not selection of a real test amount. Fetch rent from RPC. Refunded WSOL rent still
requires upfront SOL; peak solvency cost differs from net reconciliation rent.

Read-only RPC reconciliation checks finalized slot, exact persisted message,
Agent signature, complete keys, actual SOL/token/fee/rent effects. Actual effects,
never quote output, drive BUY/SELL accounting. Failed finalized swaps create an
immutable failed receipt and fee expense, no position. Recoverable rent/refunds
remain separate from trade cost basis/PnL. Paper is untouched.

## Alternatives rejected

- Trusting Jupiter labels, program presence or provider ALT maps as authority.
- Inferring full V2 semantics from discriminator names/apparent amount offsets.
- Counting only net refunded rent for upfront solvency.
- Independent DEX/withdrawal locks or timeout-based UNKNOWN release.
- Widening custody/signing before full production value-flow proof.

## Consequences and verification

See `docs/dex-production-hardening-checkpoint.md`. Useful security components are
independently tested, but route/CPI/value-flow remains a blocker. Production is
NOT_READY. Fixture signatures use deterministic test-only keypairs, never vault
keys. No Mainnet swap was signed or sent.
