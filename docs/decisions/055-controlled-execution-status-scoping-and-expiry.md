# 055 — Controlled execution status scoping and unsigned expiry

## Context

Agent Detail displayed a PREPARED review for execution `5042ab79-f4fb-4757-9797-0afcce996dd6` together with `STATE_STALE` from an unrelated historical rejection. The list status endpoint also left an unsigned, expired PREPARED record and its balance reservation active until the execution-specific endpoint was called. A rendered review is not evidence that arming is still safe.

## Decision

The authenticated list status endpoint reconciles unsigned QUOTED/PREPARING/PREPARED records through the existing expiry state machine before returning records. Signed, submitted, and uncertain records are never expired or released by this path. The server selects one current execution ID and supplies arming eligibility for that exact ID using the same validation checks as the arming operation: owner, policy, Mainnet, quote, risk, blockhash, capability, custody, reservation, and persisted message.

The UI renders current review, status, error, Arm and Confirm from that one selected ID. Historical executions appear only in a separate history section. A terminal expired record is marked `EXPIRED — REVIEW ONLY`; it cannot be armed. The UI treats server eligibility as necessary but never sufficient authorization: the arm endpoint revalidates independently.

## Consequences

Status polling can write the terminal EXPIRED transition and release an unsigned hold. This is intentional reconciliation, not a new preparation or a quote refresh. Historical execution events remain immutable. An unavailable Mainnet or validation dependency leaves arming ineligible, never implicitly enabled.
