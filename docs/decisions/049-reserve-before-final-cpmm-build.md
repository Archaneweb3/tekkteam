# 049 — Reserve controlled BUY capital before final message construction

## Context

Decision 048 left one acceptance gap: the complete CPMM transaction was built before the atomic Agent Wallet balance hold. This decision supersedes that preparation-order exception only. All execution gates remain closed.

## Decision

The production adapter first loads and verifies fresh Mainnet pool, vault, mint, ATA, rent, wallet balance, quote and blockhash state without constructing any transaction, including in the quote phase. The Risk Engine evaluates that state using the existing bounded maximum network fee. The executor atomically reserves input plus required account rent plus that fee cap while retaining the protected balance. Only the holder may then build the final unsigned message from the frozen verified policy. The full validator and exact-message simulation remain required before PREPARED.

The reservation always holds the fee cap, not the lower post-build fee estimate. Later review updates cannot shrink its resources; the existing reservation identity remains bound to the immutable execution fingerprint. Failed build, validation, simulation, cancellation and unsigned expiry settle the hold. Signed, submitted and uncertain operations retain it until proven reconciliation. The confirm capability still requires the exact reservation and message.

## Consequences

The pre-build hold is deliberately conservative by up to the difference between fee cap and actual estimated fee. A changed pool, quote, rent, wallet balance or blockhash fails closed; a new owner-reviewed preparation is required. The dry-run remains read-only and acquires no persistent reservation or executable capability. No signing or broadcasting gate is enabled by this orchestration change.
