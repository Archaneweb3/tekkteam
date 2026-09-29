# 065 — One-shot acceptance cannot inherit another custody authority

## Context

The locked USELESS/WSOL CPMM candidate has a read-only Mainnet quote and an isolated acceptance state-machine fixture. It does not yet have an owner-only production activation route, scheduler cycle, execution-port authorization, or durable acceptance-specific sign/broadcast claim. The shared CPMM adapter already supports the separate Controlled Real owner latch and normal `LIVE_AUTONOMOUS` claim. A new execution mode must not fall through to either of those authorizations, including when an injected production adapter has `allowValueMovement=true`.

## Decision

`AUTONOMOUS_ACCEPTANCE_TEST` explicitly rejects at the custody signer and broadcaster until a distinct durable acceptance claim, bound to one owner, candidate, execution, immutable intent, reservation, and final message, is wired and tested through the production port. A green read-only CPMM proof or state-machine-only fixture is not such a claim. Normal Live remains controlled by its existing flags and kill switch. The real-money emergency stop continues to block acceptance activation under the current policy; it must not be bypassed implicitly.

## Consequences

The candidate is **not ready to arm**. Its owner activation, Strategy-result audit, Risk-to-port bridge, actual BUY/SELL receipt-bound state transitions, 180-second exit scheduler, restart recovery, and owner status/control UI remain required. No acceptance mode signing or broadcast can occur through the present shared adapter. The regression test proves the explicit denial even with generic value movement enabled; it does not prove a successful acceptance cycle.
