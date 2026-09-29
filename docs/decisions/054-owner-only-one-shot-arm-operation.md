# 054 — Owner-only arming of an existing Controlled Real preparation

## Context

The one-shot latch existed but had no production entry point. A generic real-trading flag would authorize more than the reviewed first BUY. The production signer and broadcaster must remain unreachable without a claimed, execution-specific latch.

## Decision

Expose `POST /api/agents/:id/controlled-execution/:executionId/arm` through the existing authenticated owner middleware. The request takes no mutable intent fields. The server loads the persisted PREPARED execution, verifies the fixed first-buy policy, Mainnet, ownership and custody, fresh quote and risk economics, valid blockhash, transaction validator, exact persisted message and simulation, reservation, and confirmation-capability binding before atomically staging the one-shot latch. Arming neither signs nor broadcasts.

The existing manual confirmation consumes the latch only for its bound execution and capability. The production custody signer and broadcaster independently require that claimed latch and the broadcaster checks the signed transaction's message against the persisted message. The autonomous kill switch remains active; no environment flag alone can stage a latch. Expiry and terminal outcomes disarm it according to decision 053.

Agent Detail exposes arming and confirmation as separate clicks. Its confirmation capability stays only in page memory; a reload cannot recover it from status, which never returns the token. Runtime status reports the single armed execution ID without exposing the capability. Health reflects whether that latch is armed rather than claiming that a general broadcaster switch was enabled.

## Consequences

No execution is armed by deployment or startup. A future owner action must first create a fresh PREPARED execution and then explicitly arm that exact ID within its existing expiry. The one-shot path cannot be used for arbitrary mints, amounts, agents, or autonomous execution. Existing historical executions and reservations are unchanged by this API addition.
