# 059 — Separate autonomous decision orchestration from value-moving execution

## Context

The existing Market Discovery and Strategy engine can select candidates without performing Paper trades. A durable per-agent circuit breaker and a real-position monitor are needed for autonomous V1. The production CPMM signer still requires the manual Controlled Real one-shot latch, while its validator only proves the exact WSOL/USDC pool. Reusing that latch for AI execution would cross the owner-authorization boundary.

## Decision

Add a server-side autonomous tick that reuses candidate ordering and `strategyIntent`, resolves only the proven venue, monitors one real position with fresh valuation, and derives one immutable operation key per meaningful BUY or SELL intent. Persist execution-health failures and owner-only resume conditions in a separate per-agent store. An injected execution port is required for value movement and must explicitly attest to the production boundary; without it the tick rejects before signing. Fixture ports exercise decision/monitor sequencing but are not evidence of a production signer, broadcaster, or on-chain reconciliation.

## Consequences

No live scheduler invokes this tick, and no production autonomous execution port exists. The new take-profit, stop-loss, and max-hold fixtures cover orchestration decisions only. They do not prove reservation, transaction validation, signature verification, single broadcast, confirmed BUY/SELL accounting, or actual Pump.fun token support. Live remains disabled and V1 Mainnet acceptance remains `NOT_READY` until those missing boundaries are implemented and tested through the same production path.
