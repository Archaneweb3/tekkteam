# 063 — Autonomous acceptance candidate remains disarmed

Superseded by [064](./064-classic-wsol-cpmm-derived-pool-policy.md) for the execution-envelope limitation. The candidate remains unauthorized for real trading.

## Context

The known WSOL/USDC CPMM pool has insufficient activity for a Strategy acceptance candidate. A read-only Raydium standard-pool discovery query identified a more liquid WSOL/classic-SPL CPMM pair, and an independent Mainnet snapshot verified its pool owner, schema, PDA relationships, vaults, token programs, context-slot fence, and local 100,000-lamport BUY quote. Separately, ten paced read-only checks of the production WSOL/USDC loader passed with the unchanged 10,000 ms freshness limit. Earlier unpaced calls failed at RPC transport without a snapshot diagnostic; this does not prove the historical `STALE_CPMM_SNAPSHOT` cause.

## Decision

Treat the new pool as a **research candidate only**. The production loader, envelope, transaction validator, autonomous venue resolver, position accounting, market-provenance bridge, and first-acceptance policy are bound to the original WSOL/USDC pool. On-chain CPMM provenance does not itself establish support by that execution envelope. Do not substitute the candidate into hard-coded constants or create an acceptance authorization that would bypass those independent checks. Keep Live and all value-moving gates disarmed. Do not change the 10-second freshness policy without a captured, specific stale diagnostic proving the fault.

## Consequences

The engine acceptance remains `NOT_READY`. A subsequent implementation must explicitly extend and test the full classic-SPL CPMM envelope, BUY/SELL position lifecycle, Risk, validator, exact-message simulation, and one-shot owner authorization for one locked mint/pool before any real acceptance. The read-only candidate proof and freshness checks can be rerun without reserving, signing, or broadcasting.
