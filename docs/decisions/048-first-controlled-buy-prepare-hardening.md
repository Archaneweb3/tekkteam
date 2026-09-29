# 048 — Fail closed before the first controlled BUY review

## Context

The disarmed CPMM production wiring in decision 047 proved the unsigned envelope but did not reverify the vault identity before creating a real preparation, did not constrain the first acceptance to a single exact intent, and did not require simulation of the final message before owner review.

## Decision

Keep `CONTROLLED_REAL_ENABLED=false`, the real-money emergency stop active, and the production adapter's signing/broadcast latch disarmed. Add a temporary server-side acceptance allowlist for one owner, agent, Agent Wallet, 100,000-lamport BUY, classic WSOL/USDC CPMM pool, and at most 100 bps slippage. The authenticated production route verifies the existing encrypted vault identity before entering the executor's ledger flow. A different or second request key for this agent fails the acceptance policy.

After fresh build and Risk checks, PREPARING records acquire the atomic real-balance reservation. The full validator and exact unsigned-message simulation must then pass before the exact message/hash, blockhash, risk review, simulation reference, and owner capability are persisted as PREPARED. A failure makes the unsigned request terminal and releases its reservation. Expiry also releases it. Confirmation rejects a record without a successful simulation bound to its message hash; it never rebuilds the transaction.

The dedicated dry-run script verifies custody, fresh Mainnet state, local quote, Risk, validator, blockhash and exact unsigned simulation without creating an execution, reservation, capability, signature, or broadcast.

## Consequences

This is acceptance-specific hardening, not general trading enablement. The final transaction is currently assembled before the PREPARING balance hold because the existing CPMM state loader returns a validated complete envelope and the risk snapshot depends on that envelope's fee. The hold is acquired before final validation/simulation and before PREPARED. No activation or real trade is authorized by this change; a later activation requires a separate owner-review decision.
