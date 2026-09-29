# 064 — Derive classic WSOL CPMM roles from fenced Mainnet state

Supersedes the execution-envelope limitation recorded in [063](./063-autonomous-acceptance-candidate-remains-disarmed.md).

## Context

The original production CPMM envelope was tied to one WSOL/USDC pool even though its PDA, vault, observation, token-program and exact-instruction proofs were structural. A current WSOL/classic-SPL CPMM candidate was independently proven on Mainnet. The discovery-to-execution bridge also expected `verified.snapshot`, while the actual production loader returns `verified.policy.snapshot`. Active pools can update dynamic counters between the first address-discovery read and the dependent account read; byte-for-byte pool equality incorrectly rejected these fenced snapshots.

## Decision

Treat a caller-supplied pool address only as a discovery hint. The loader fetches it on Mainnet, fences the dependent account read to the first context slot, rejects any change to the ten discovered account-role addresses, and validates the complete *second* account set with the independent CPMM inspector. Only pools owned by Raydium CPMM, with verified config/authority/vault/observation PDAs, exactly one WSOL side and two classic SPL Token mints, are supported. BUY/SELL direction and ATA roles derive from those verified mints. The envelope validator reconstructs the exact allowed Compute Budget, ATA, WSOL, swap and cleanup instructions and rejects unknown accounts or instructions. Existing controlled first-buy policy remains separately locked to WSOL/USDC.

MarketIdentity remains an indicative Dexscreener identity, not a permission. The production provenance bridge reads the actual loader shape and binds the independently verified pool to that identity. The autonomous resolver yields an identity descriptor only; the shared production adapter re-fetches and re-verifies the pool before building any transaction. Realized effects still come from finalized chain reconciliation.

The USELESS/WSOL candidate is a concrete integration fixture, not a default trade or allowlist. Its current unsigned BUY was locally quoted, Risk-approved, fully validated and successfully simulated; a synthetic post-BUY SELL envelope validated offline. The one-shot acceptance policy is implemented as a disarmed, owner-bound state machine but is **not wired to a production activation route or signer claim**. Live, signing and broadcast remain disabled.

## Consequences

Historical WSOL/USDC serialized messages remain supported. Captured Mainnet fixtures cover both pool orientations and compare quote math against pinned Raydium SDK source. Dynamic pool counters may advance across the two reads; role-address mutation, stale context, Token-2022, altered accounts, amounts and extra value-moving instructions still reject. The current candidate is not authorized for real trading. The acceptance latch must be connected to the existing scheduler/execution port with independent owner activation, Risk, kill-switch, claim and terminal reconciliation tests before one real cycle can be declared ready.
