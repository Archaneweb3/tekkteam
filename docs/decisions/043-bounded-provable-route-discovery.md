# 043 — Bounded discovery does not imply route approval

## Context

Deriverse remains unproven. User authorized bounded read-only search for a simpler independently provable Jupiter route, not an execution bypass.

## Decision

Use only documented V2 dexes/excludeDexes/maxAccounts controls in the offline production dry-run helper. Reject unknown controls before provider access. Four calls across Raydium CP and Whirlpool BUY/SELL are the complete budget. Stop with no selected candidate because both directions cannot satisfy the proof gate. Preserve empty production allowlists and Deriverse decoder.

## Consequences

Raydium CP HTTP 400 responses yield no proof. Whirlpool observations do not establish deployed Jupiter CPI semantics despite available downstream source. Do not convert generic account ownership into approved roles or pretend all-rejected fixtures demonstrate positive support. No route-specific minimum capital can yet be asserted. See ../provable-route-checkpoint.md and focused evidence documents.
