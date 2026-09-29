# 067 — Bound min-context RPC lag recovery before custody

## Context

One owner-authorized acceptance cycle failed without value movement when a Mainnet RPC dependent account read returned `-32016` (minimum context slot not reached). The pool read and dependent read may reach different backend nodes. Removing `minContextSlot` would admit stale or internally inconsistent CPMM state, so that is not an acceptable recovery.

## Decision

Only the acceptance mode may opt into retrying the read-only CPMM state loader before balance reservation. A retry discards every account and quote value from the incomplete attempt, waits 120 ms then 240 ms at most, and begins with a new pool read and a new `minContextSlot`. The limit is three attempts and a five-second acquisition window. A response below the required slot is rejected and may also be retried by starting a fresh snapshot; an account-count mismatch or unrelated RPC error is not retried. Safe slot, count, timing, attempt, and error-code diagnostics are retained; RPC URLs, credentials, account payloads, and custody material are not. The resulting quote obtains a new timestamp only after a complete snapshot passes the existing freshness and slot policies.

The opt-in is supplied only by provenance, quote, and capital reads before reservation. Reads after reservation, signing, submission, or during reconciliation keep their existing non-retry behavior. Exhaustion fails the current cycle or execution before signing. No new execution ID, reservation, signature, or broadcast is created by a state-fetch retry. The first-acceptance history and owner authorization remain independent of this transport recovery.

The currently configured fallback is the public Solana Mainnet RPC. Repeated read-only acquisition hit HTTP rate limiting well before 20 successful snapshots. This is a separate, non-retryable failure: a narrow `-32016` retry must not become a generic rate-limit workaround. Owner activation is therefore unavailable unless a non-public Mainnet RPC endpoint is explicitly configured. Configuration alone does not prove provider capacity; a fresh read-only preflight remains necessary before a real acceptance run.

## Consequences

Sequential requests can be served by different RPC nodes without weakening the slot fence. A provider that remains behind, rate limits, or returns a different error still fails closed. Public Mainnet RPC availability is an operational constraint, not a reason to bypass the proof boundary or retry value movement.
