# 093 - Pinned Pump offline qualification is not execution support

Date: 2026-10-01. Status: accepted local source boundary; deployment, custody,
Real adapter integration and chain qualification are NOT accepted by this record.

## Context

The associated-coin Paper policy does not prove the existing narrow CPMM executor
can trade a Pump bonding curve or canonical migrated PumpSwap pool. The direct
continuation authorizes local decoders, quotes, unsigned simulation and executor
dependency tests, but prohibits signing/broadcast, Live, actual funding and deploy.
Existing receipt/idempotency/Risk/reservation/owner/network boundaries remain.

## Decision

Use pinned official public Pump SDK2.0.0 and PumpSwap SDK1.20.0 for offline account
decoding, quotes and typed instruction construction. Node22 uses supported public
CJS entries through createRequire; the ESM transitive anchor BN packaging failure
does not authorize node_modules patches or importing undocumented internals.
Package/IDL fingerprints identify the local pin, not deployed program integrity.

The decoder issues an immutable DERIVED/DISARMED descriptor with module-private
raw state. JSON/browser copies are not evidence. It fixes associated owner/mint,
Mainnet genesis/slot context, authority-free six-decimal mint, qualified extensions,
curve or canonical migrated pool/PDA/vault relationships and actual WSOL-vault
sync. Signed virtual quote reserves remain BigInt; effective actual-plus-virtual
reserves must be positive/bounded. Unknown modes/layouts fail closed. Configurable
creator fees require decoded global enable/ceiling and effective-fee bounds.

Unsigned four-path fixtures use canonical typed accounts, no ALT/signatures,
wrapping, ATA creation, extra instructions or broadcaster. An independent literal
account oracle supplements exact reconstruction. Inventory distinguishes known
local layouts, missing reads/provisioning and unsupported auxiliary state; derived
PDA existence never proves readiness. Local simulation must recheck authority,
Pause/revision and expiry around each await, including auxiliary coders/effects.

Fixture effects are separately bound to the exact unsigned message, account
indices, raw roles, mint/program/authority/token/native amounts and existing-rent
constraints. Optional conservation checks reject unbalanced native/token effects,
readonly mutations, account provisioning and observed supply overflow. Unknown
post-state/fee roles remain explicit blockers. These reports never produce a
receipt, position, PnL, confirmation capability or execution authorization.

The only existing-executor integration is quote-provider compatibility with
immutable intent/idempotency plus negative preparation/pending-recovery tests.
No Pump runtime adapter is mounted. General/Paper/CPMM behavior is preserved.
BUY has spendable-budget semantics: estimated debit can differ from input budget;
SELL uses exact token input. Existing Real exact-input equality, native-SOL
accounting and reservations are not relaxed to accommodate WSOL budget dust.

## Alternatives

Hand-rolled venue math and assumed curve-to-pool support were rejected: official
layouts, negative virtual reserves, extensions and fee overrides must be explicit.
Reusing CPMM authorization/accounting as proof of Pump support was rejected.
Removing exact-debit or owner/network guards to make fixture preparation pass was
rejected. Automatically provisioning accounts, changing custody or enabling flags
is outside this local contract.

## Consequences

CURRENT: reviewable offline functions/tests and explicit unqualified dependencies.
TARGET: separately qualified full envelope/account provisioning/fee-rent policy,
asset-aware reservation/accounting and authentic RPC/finalized effects before a
guarded Pump runtime adapter. This ADR does not claim READY FOR AUTHORIZED REAL
TEST. Actual program deployment, genuine owner/custody wallet, finalized signature
and public metadata delivery remain separate qualifications and authorizations.

The dependency audit introduces additional advisory debt (current15 vs baseline9
at this checkpoint); exploitability is not determined. No force major downgrade,
production installation or security acceptance is inferred from passing fixtures.

## Verification

See DELIVERY_PLAN.md and artifacts/launchpad-continuation/direct-delivery for exact
source-reviewed scopes, final unique-file test union/build and guest browser
evidence. Independent source review is distinct from a reviewer rerun or chain
verification. Historical DOT attempts and paused orchestration remain untouched.
