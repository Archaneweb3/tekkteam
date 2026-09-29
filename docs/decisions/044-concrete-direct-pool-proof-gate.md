# 044 — Concrete direct-pool evidence is not executor approval

## Context

The user authorized one classic-token Mainnet pool proof per PumpSwap and Raydium CPMM, unsigned local construction and safe simulation, but no signing/broadcast/funding. Source-to-binary equivalence must remain an explicit trust assumption unless proved.

## Decision

Retain public, slot-specific account snapshots and pinned schema/math evidence. PumpSwap stops before construction because concrete buyback/remaining-account value effects and exact-input differential semantics are not modeled. Do not omit required accounts or silently permit SDK additions.

CPMM evidence helpers and decoder remain offline and fixture-scoped. Local quote/instruction parity and isolated native lifecycle checks are not a claim that the complete production validator accepted the transaction. Its explicit envelope rejections must be retained and tested. Missing full-validator WSOL/ATA composition is an implementation gap, not proof that CPMM itself is unverifiable. Real SELL additionally lacks the Agent's source ATA/balance in this snapshot. Do not manufacture a holding to bypass that precondition.

No direct production adapter, signer integration, registry entry, capital recommendation or execution flag change follows from partial proof. Jupiter remains preserved/locked. Existing frozen runtime systems remain untouched; the requested suite-health work is confined to test harness synchronization and transport diagnostics.

## Consequences

No candidate has the complete supported BUY+SELL envelope required by this checkpoint. Future work must explicitly close the concrete gaps and pass full-envelope mutations before capital modeling or acceptance. Deployment hashes document identity, not binary equivalence. Reports must distinguish successful public-state provenance from unsupported execution.

## Evidence

See ../concrete-pump-proof.md, ../concrete-cpmm-proof.md and ../concrete-suite-determinism.md. Offline fixtures are historical and must never be replayed as live requests.
