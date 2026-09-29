# 068 — A bounded RPC budget for one acceptance agent

## Context

The one-shot acceptance worker reads a CPMM pool for provenance, pre-Risk quote and capital, and then execution quote and capital. Each read obtains pool context, a fenced multi-account snapshot, rent and blockhash; periodic position valuation repeats the read every 15 seconds. A generic burst benchmark exceeded the configured Mainnet provider's rate limit even though paced reads usually succeeded. The engine's transaction, reservation and custody rules must not change to hide an RPC capacity problem.

## Decision

Only opt-in acceptance reads before balance reservation use a shared per-connection RPC budget. It serializes the security-sensitive read methods with a 120 ms minimum start gap and coalesces identical *concurrent* calls, including their commitment and `minContextSlot` arguments. There is no settled-result cache. A dependent snapshot always remains fenced to the pool context slot, and its existing 10,000 ms freshness limit remains unchanged.

An HTTP 429 may restart the complete pre-sign snapshot acquisition, never a partial account set, within the existing three-attempt/five-second envelope. Backoff is at least 500/1000 ms and respects a longer provider `Retry-After` when the web3 transport exposes it through the narrow fetch observer. If that wait exceeds the envelope, acquisition fails closed. A blockhash response below the fenced dependent snapshot slot may likewise restart the *entire* read; it is never accepted as current. The fetch observer retains only a delay in the active read scope; it never stores the URL, body, credentials or RPC response. The previous timeout race was removed because it could leave orphan requests consuming capacity after an attempt had already failed.

This budget does not wrap the signer, broadcaster or reconciliation. It also does not provide a cache shared across Risk and execution, nor does it weaken Mainnet, quote, Risk, validator or simulation checks. Current one-agent capacity must be checked with the actual production-shaped read cadence; a healthy synthetic throughput benchmark alone is not an activation gate.

## Consequences

At most one budgeted read request is in flight per Mainnet connection. Concurrent identical reads consume one provider request, while sequential security checks still re-read state. A provider that cannot serve the real one-agent request pattern within freshness and retry limits remains a blocker; no automatic real acceptance cycle follows a successful read-only preflight.
