# 109 — Explicit owner consent and exact preparation readiness

7 October 2026. CURRENT: local, unmounted library contracts. Production trading,
funding, withdrawal, signing and broadcast remain OFF. No human consent is created
by this change. Existing wallet Sign In remains authentication only.

`owner-trading-consent.js` records a separate Ed25519-signed, domain-separated
message. It binds the HTTPS origin, owner, Agent wallet, receipt/mint/Mainnet,
saved plan revision, personality version, Pump program, BUY/SELL scope, fixed
time window, nonce, fees, rent, reserve and all spending/count ceilings. Stored
review and proof are immutable. Approval consumes the current Agent epoch;
revocation advances it and invalidates both active and outstanding reviews.
Retries cannot extend expiration or create a second authorization session.

Existing reservation-budget accounting remains the only debit/count ledger.
The resolver verifies the actual signature and current plan/binding every time.
It does not by itself enforce transaction instructions or grant execution: the
runtime risk, program, final-message, simulation and claim boundaries must enforce
the signed venue/actions/slippage/fee/reserve policy before any future mount.
The existing 100,000-lamport BUY and 500,000-lamport session/day ceilings remain.
First-BUY account rent exceeds these limits and is not exempted.

Clock contract: an owner read or `checkpointClock()` commits a high-water mark
outside a reservation transaction. Claim-time read-only resolution requires a
checkpoint no older than five seconds and rejects process-local clock rollback.
An expired owner read commits its time even while reporting failure. Revocation
is possible during clock rollback and without RPC/plan readiness. This does not
claim universal rollback protection for a resolver-only failed observation that
was never committed before process exit. A future hosted mount must checkpoint
each cycle and retain the independent product-DB lease/clock guards.

`pump-readiness-attestation.js` bridges asynchronous `verifyPrepared()` plus
native validity to synchronous claim checks. Its bounded, transient cache binds
the complete persisted record, plan, exact message and simulation evidence.
Any mutation, expiry, invalidation, qualification loss or restart requires fresh
verification. It neither reconstructs transaction bytes nor substitutes blockhashes.
Readiness is not a signature capability. No app constructor/routes import either
new library; no worker/signer/sender is mounted.
