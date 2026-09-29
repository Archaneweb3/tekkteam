# 053 — Persist a one-shot execution ID, never arm a trading mode

## Context

The first Controlled Real BUY can be prepared and reviewed while the Mainnet
signer and broadcaster remain physically disarmed. A broad `CONTROLLED_REAL`
flag would be the wrong authority for signing: it could cover another agent,
another message, or a second operation. Expired unsigned preparations must
release their reservations without becoming signable again.

## Decision

Keep a single persistent latch bound to an already-existing PREPARED execution
ID, canonical first-buy intent, final message hash, reservation intent hash,
blockhash, and confirmation capability. Staging is deliberately not exposed as
an HTTP endpoint or driven by an environment flag. A future explicit owner
workflow may stage only a fresh, fully bound record; no nonexistent execution
can be staged. The owner's exact confirmation token and reviewed message must
match before a transactional one-shot claim. A claimed latch is consumed, so a
double click or second execution cannot claim it. The executor still performs
fresh ownership, risk, quote, block-height, validator, simulation, custody,
and Mainnet checks before signing, and it never rebuilds the reviewed message.

An unsigned expiry or terminal rejection disarms the latch. A claimed latch
remains consumed through UNKNOWN until reconciliation proves a terminal
outcome. Terminal reconciliation disarms it without making it reusable after
value-sensitive execution. The autonomous kill switch remains independent.

## Consequences

The current production adapter still has `allowValueMovement:false`, and its
confirm route rejects before entering the executor. This architecture adds no
real signing or broadcast authority; it is exercised only by fixture tests.
Any later activation requires a separate scoped owner workflow and review of
the production signer/broadcaster gate. No real execution was staged or armed
when this decision was recorded.
