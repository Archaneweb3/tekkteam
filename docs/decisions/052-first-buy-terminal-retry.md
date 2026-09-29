# 052 — First-buy acceptance survives proven pre-sign failures

## Context

The first Controlled Real BUY is limited to one fixed owner, Agent Wallet, mint, pool, and amount. The earlier policy treated any different request key in execution history as consumption of that opportunity. A quote failure therefore left an immutable `REJECTED_BEFORE_SIGNING` record but permanently disabled the owner's first preparation, even though no transaction was constructed or signed.

## Decision

Keep every execution and event immutable. A new request key is eligible only when **every** prior record is terminal before signing and the record, immutable event history, receipt table, and reservation state agree: no signature, signing claim, broadcast attempt, receipt, or active/unreconciled reservation. `REJECTED_BEFORE_SIGNING`, clean pre-sign `EXPIRED`/`CANCELLED`, and `FAILED` specifically caused by cancellation before signing may be retried. Any history reaching `UNKNOWN`, `SIGNED`, `SUBMITTED`, or `CONFIRMED` blocks a new first-acceptance intent. Other `FAILED` reasons also block. Missing event evidence fails closed.

The same request key still identifies the existing operation; the ledger's canonical fingerprint conflict check remains unchanged. The server alone computes `acceptanceEligible`; UI history length is not an authorization gate. A previous failed record remains visible in the owner's review surface.

For the current `QUOTE_UNAVAILABLE` record, the server stored no transaction or message, signature, broadcast attempt, receipt, or reservation; immutable events show only `QUOTED` then `REJECTED_BEFORE_SIGNING`. A separate read-only finalized Mainnet check found no Agent or Owner signatures since that failed attempt. This evidence does not authorize signing or broadcast.

## Consequences

An unsigned failure does not consume the one-time acceptance, but any ambiguous value-sensitive path fails closed. The prepare route rechecks server-side history before accepting a fresh intent. The global emergency stop, disarmed signer/broadcaster, disabled Live, and fixed first-buy policy are unchanged.
