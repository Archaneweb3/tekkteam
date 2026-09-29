# 046 — Separate owner-confirmed real execution from autonomous trading

## Context

The generic DEX fixture executor treated the existing global trading kill switch as a blanket real-execution prohibition. That prevented testing a separately owner-confirmed path while retaining the autonomous safety stop. Production CPMM prepare/confirm and its signer remain intentionally disabled under decision 045.

## Decision

Define three explicit server modes: PAPER, CONTROLLED_REAL, and LIVE_AUTONOMOUS. PAPER cannot consume real-execution authority. LIVE_AUTONOMOUS remains blocked by the existing global/autonomous kill switch and has no available executor. CONTROLLED_REAL requires its own disabled-by-default feature flag, Live disabled, authenticated owner and matching agent/wallet, Risk Engine approval, exact validated message, atomic reservation, and a short-lived server-issued capability bound to owner, agent, wallet, direction, mints, input, minimum output, pool, slippage, route policy, message hash, reservation identity and expiry. A separate `REAL_MONEY_EMERGENCY_STOP` defaults active and blocks every real mode.

The capability secret is returned only by a successful preparation; only its hash and binding hash are persisted. Confirmation compares the token and immutable binding, rechecks the active reservation and original transaction/risk, then uses the pre-existing durable one-shot signing claim. No frontend mode or arbitrary transaction is accepted as authority. Expired unsigned preparation becomes terminal and releases its reservation. Signed/unknown outcomes retain reservations pending reconciliation.

The production CPMM adapter, production prepare/confirm HTTP gate, and UI confirmation button remain disabled. This phase cannot spend; turning on an environment flag alone cannot unlock it. The separate emergency stop must be deliberately configured false in a future controlled acceptance phase after the production adapter and review path are verified. The autonomous kill switch stays active throughout.

## Consequences

Fixture-only controlled execution can prove owner confirmation while the autonomous kill switch is active. Paper, AI loops, and autonomous mode have no path to consume that capability. Existing funding, withdrawal, custody, Paper, and CPMM math/validator remain unchanged. Production readiness still requires a verified concrete adapter and an independently reviewed manual UI; this ADR is not authorization for a BUY.

## Verification

`tests/dex-authorization.test.mjs` and `tests/dex-executor.test.mjs` cover the mode split, emergency stop, owner/binding/reservation checks, one-shot confirmation, pre-sign expiry, and no second broadcast. Production route continues to reject prepare/confirm with `UNVERIFIED_ROUTE_ADAPTER`.
