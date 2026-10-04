# 086 — DOT fixture write/repair proof

## Status

Accepted for disposable local fixture and Phase A read-only rehearsal, 2026-09-30. Product writes remain denied.

## Context

Read-only echo delegation did not prove code editing or repair. A dirty checkout with sensitive state must not be the first write target. Windows sandbox configuration is necessary even when user configuration is ignored.

## Decision

Use installed workspace-write CLI with explicit native Windows sandbox and network disabled only in a newly created disposable fixture. Separate implementation and independent review invocations. Validate strict output schemas, snapshot exact file scope, run immutable acceptance probes and preserve unrelated behavior. Deterministically defer boundary handling until review so the proof includes an actual failed assertion, model-requested repair, actual second edit and independent PASS.

Persist execution cursors before write; ambiguity requires reconciliation, external limits stop without automatic retry. Resume evaluates existing files before authorizing a new bounded repair. Final fixture proof requires real distinct session IDs, successful turns, actual tests and unchanged certified file hashes. Only then run real Phase A tests/build/source review; REPAIR_NEEDED produces a proposed task, not a product mutation.

## Alternatives

Reject danger-full-access, inherited plugins/hooks, self-certified PASS, fabricated fixture outcomes, globally clean-worktree requirements and blind replay after interruption. Do not use semantic keyword matching as the only boundary; built-in scope and deny-by-default action ports are authoritative.

## Consequences

DOT proves a real local implementation/repair loop without granting roadmap, production or real-money permissions. Defaults remain no commit/push, no production access, no real-money actions. Fixture-only proof is not a certificate for arbitrary commands or arbitrary repository writes. No product API, UI, authentication or trading semantics change.
