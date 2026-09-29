# 069 — Emergency Stop is independent of execution readiness

Status: Accepted

## Context

The owner-facing acceptance panel could become unavailable while its status or custody read failed. The stop route also reused the normal execution authorization helper, which required an Agent Wallet mapping. Neither condition is necessary to stop new execution. A signed-but-uncertain execution must retain its durable signature and reservation for reconciliation.

## Decision

The acceptance Emergency Stop route requires an authenticated owner and ownership of the fixed agent, but not wallet/RPC/quote/risk/prepare readiness. The UI exposes Stop outside developer tools and keeps it available when status reads fail. It requires one owner confirmation and prevents duplicate clicks. The existing stop state machine revokes permission without deleting executions, positions, signatures, or reservations. An already stopped cycle returns its original stop state idempotently.

The interface describes an UNKNOWN signed outcome as requiring reconciliation, never as proof that no transaction was sent. Technical acceptance actions and execution history remain behind progressive disclosure.

## Consequences

An owner can stop new value movement during a degraded status read. Stop is not an on-chain cancellation. Reconciliation continues to use the same signature and must not release UNKNOWN/SUBMITTED reservations merely because Stop is active.
