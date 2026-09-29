# 071 — Durable, allowlisted Pump.fun Prepare diagnostics

Status: Accepted

## Context

A manual Prepare failure produced only a friendly UI message. The launch receipt is written only after successful preparation, while the child readiness process previously reduced stderr to a coarse error code. Thus failures before receipt persistence could not be assigned to a request, stage, or process exit without replaying a real Prepare.

## Decision

Create a separate, append-only Prepare attempt journal before owner lookup. Record stage transitions and a terminal result for each request, including failures before a launch receipt exists. The journal and API response use allowlisted identifiers, booleans, timestamps, public addresses, numeric statuses, and sanitized error classifications. The child readiness process may emit stage-only progress events and a bounded, sanitized failure classification; raw stderr, RPC URLs, credentials, stacks, auth cookies, and signing material are never persisted. Deprecation warnings remain distinct from fatal errors.

The frontend generates a UUID at the manual click and keeps a minimal, safe local attempt summary, then passes that UUID to the server. The server preserves a valid, unused UUID but never lets a repeated ID overwrite history. The frontend retains the friendly error, adds the attempt ID and safe failure stage/code, and copies only an explicit diagnostic allowlist. A network failure before reaching the launch service cannot create a server journal entry; the browser's local summary identifies it as service unavailable without claiming a server-side attempt was recorded.

## Consequences

The next manually initiated Prepare can be diagnosed without replaying it. The attempt journal is distinct from the launch receipt and cannot authorize signing or broadcast. Transaction construction, payer semantics, initial-buy calculation, and launch state-machine transitions remain unchanged. Diagnostics are intentionally less detailed than raw process output when a message cannot be safely classified.
