# 057 — Keep autonomous value movement disarmed until a separate execution path exists

## Context

The current agent scheduler and trading projections are Paper-only. `LIVE_AUTONOMOUS` is explicitly rejected by the DEX authorization boundary. The validated Raydium CPMM executor currently authorizes a manual Controlled Real execution with a one-shot owner capability; that capability must not be repurposed for an autonomous strategy signal. The real position ledger records confirmed fills, but there is no production autonomous discovery-to-BUY-to-monitor-to-SELL orchestration or real mark-to-market projection.

## Decision

Keep `LIVE_TRADING_ENABLED=false`, the autonomous kill switch active, and the real-money emergency stop active. The manual owner confirmation capability remains exclusive to Controlled Real. A future autonomous path must have its own server-side authorization, narrow supported-venue resolution, canonical intent and risk limits, the existing reservation/build/validator/simulation/sign-once/broadcast-once/reconciliation boundary, and a one-position circuit breaker. A signal, quote, signed attempt, or submitted transaction alone must never create or close a real position; only confirmed on-chain fills may do so.

Do not treat green Controlled Real fixture tests as autonomous lifecycle acceptance. Manual Mainnet BUY and SELL acceptance remain separate prerequisites before any tiny autonomous Mainnet acceptance can be considered.

## Consequences

The existing Paper loop cannot move real funds, and the manual capability cannot be consumed by an AI invocation. Until the separate autonomous orchestrator, failure fixtures, real valuation/exit monitor, and manual BUY/SELL acceptance are complete, the V1 autonomous gate remains **NOT_READY**. Backend arm eligibility and missing browser-held confirmation capability are shown separately in the manual review UI; neither display state grants signing authority.
