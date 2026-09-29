# 058 — Bound autonomous V1 authorization to proven venues

## Context

The Paper scanner cannot be repurposed for value movement: it evaluates and writes simulated trades. The existing production CPMM adapter and validator prove one classic-SPL WSOL/USDC pool, not arbitrary Pump.fun tokens or PumpSwap. Controlled Real uses an owner-held browser capability and a one-shot manual latch; those are not autonomous credentials.

## Decision

Introduce a separate, fail-closed autonomous policy boundary. It requires explicit live enablement, an inactive autonomous kill switch and real-money emergency stop, verified Mainnet, verified vault/ownership, fresh market data, Risk PASS, one-position capacity, daily turnover/cooldown and a three-failure circuit threshold. It does not accept or inspect a browser confirmation capability.

Venue resolution accepts only the exact pool and pair actually supported by the current production CPMM adapter. Other discovered Pump.fun tokens yield `UNSUPPORTED_EXECUTION_VENUE`; PumpSwap and Jupiter are not fallbacks. Real floating PnL requires a fresh, locally verified sell valuation and is marked unavailable otherwise. Quotes never become confirmed fills or realized PnL.

## Consequences

These pure policy/valuation functions are necessary but not sufficient for live V1. They are not wired to the Paper scheduler, signer, broadcaster, or real-position monitor. No autonomous value-moving production executor or end-to-end lifecycle fixture exists yet. The live feature and both kill switches remain in their disarmed states; readiness is `NOT_READY` until a separately tested orchestration, confirmed BUY/SELL accounting, circuit persistence, and supported Pump.fun pool proof are complete.
