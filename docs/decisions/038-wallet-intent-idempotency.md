# 038 — Frontend idempotency keys bind immutable transfer intents

## Context
Prepare failure left the form editable but retained its key. A changed amount
was sent under that key, correctly rejected by backend idempotency. The exact
lost Edge 409 payload cannot be proven; this verified lifecycle is the regression
target, not a claimed reconstruction of that unavailable request.

## Decision
At the first manual prepare, bind a UUID to a snapshot of kind, agentId, source,
destination, integer lamports and network. Reuse it for the same intent regardless
of retries, rerenders, latency or reconciliation. A subsequent prepare with changed
canonical fields binds a fresh key; a new deliberate Fund/Withdraw opening resets
the lifecycle. Rendering/refreshing never generates keys. No key is automatically
rotated on errors. Equivalent textual amounts map to identical integer lamports.

The existing busy latch still prevents concurrent button actions. Existing active
backend requests still block replacements: changing an intent is not permission
to bypass unresolved transfers. Destinations remain server-derived, not browser
authority. Backend conflict detection, signing and broadcast remain unchanged.
No localStorage, cookies, or secret data added. State remains per mounted agent UI.

## Verification
Deterministic key-generator unit tests, production UI with injected fixture APIs,
and isolated database route tests cover amount edits after failure, same intent,
double clicks, rerender/reconciliation, close/reopen, terminal-to-new operation,
direction/agent/source/destination/network changes and backend conflict rejection.
No real wallet prepare, signature or broadcast is used by these tests.
