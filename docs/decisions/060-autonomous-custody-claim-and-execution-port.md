# 060 — Durable autonomous custody claim and shared CPMM execution port

Supersedes the "no production autonomous execution port" consequence of decision 059; its Live-disarmed and venue-boundary decisions remain in force.

## Context

The manual Controlled Real one-shot capability must never authorize an autonomous strategy. The existing CPMM production adapter already owns the vetted pool loader, local quote/build, complete transaction validator, unsigned simulation, custody signer, one-send broadcaster, and finalized RPC effects. Duplicating that transaction implementation for Live would create a second, unproven security path.

## Decision

Use the same CPMM adapter behind a separate autonomous execution port. The port requires explicit Live authorization, verified Mainnet/vault/Risk/venue, creates an immutable ledger execution, acquires the existing atomic balance reservation before build, validates and simulates the final message, then durably transitions to a signing claim before custody access. A separate database claim table permits at most one signer invocation and one broadcaster invocation per execution. The adapter checks that durable claim for `LIVE_AUTONOMOUS`; its manual owner latch cannot satisfy it. On uncertain send outcome, the same signature and reservation remain locked for reconciliation.

Only a finalized, independently validated RPC receipt updates the real position ledger. The receipt carries actual input/output, fee, rent, slot, and signature; quotes never become fills. A read-only, owner-scoped data contract exposes confirmed position and history separately from Paper. The port is constructed in production but is not scheduled by the Paper loop, and all Live switches remain closed.

## Consequences

The production transaction components are shared, but a future Live scheduler still needs an audited agent lifecycle/Risk/market-state binding before it can invoke the port. Fixture tests cover both the port state machine and the actual CPMM adapter with injected RPC/custody/send and finalized effects. No green fixture alone authorizes a real Mainnet autonomous acceptance.
