# 098 — Limited Phantom final-message validation

Accepted implementation contract, 6 October 2026. Supersedes the compatibility
authorization blocker in 097 for new explicitly enabled action-time executions.
Historical attempts remain immutable. Runtime qualification and real launch are
separate from the local engineering evidence below.

The owner's current mandate permits one recognized Phantom Lighthouse assertion
after the original Pump create_v2 instructions. Existing payer, signer order,
blockhash, instruction data, account metas and global privileges must remain exact.
The only additional key is the known readonly Lighthouse program. Its canonical
26-byte AssertAccountInfoMulti encoding checks the same owner account's minimum
balance, System ownership and zero data length. Unknown variants or mutations fail.
The assertion floor is not the application debit ceiling: the independent 0.01 SOL
ceiling, zero initial buy, exact reviewed fee/debit and reserve checks still apply.

The server atomically binds the valid owner-signed final payload before adding the
mint signature. A mint signer is temporarily encrypted with the existing store
vault, authenticated to execution/owner/Agent/mint/review/blockhash, and never sent
to the client or included in execution history. Its row is logically deleted when
consumed, rejected, expired or replaced. This is not physical SQLite/WAL erasure.
Crash recovery never resumes signing or sending automatically: only native expiry
plus signature/transaction/mint absence permits an explicit fresh preparation.

Final revalidation uses the actual fully signed message, sigVerify=true, unchanged
blockhash, all compiled accounts, final fee, atomic pre/post balances, known CPI
effects, mint/ATA authorities and metadata. It records both fingerprints, allowed
diff, final evidence and proof before the durable one-shot send claim. Confirmation
matches the landed bytes and authoritative Pump provenance before provisioning.
The Lighthouse program and ProgramData identity are checked before/after simulation
and before send. These checks establish per-attempt consistency, not verified
source-to-binary equivalence or a guarantee against upgrade after the final read.

Default is off. Only the explicit m4Lighthouse capability with native action-time
preparation and the existing encrypted store enables this path. Legacy records and
other signing/transports retain exact-message behavior. No trading authorization
is implied. Financial wallet approval remains manual; warnings are never bypassed.

Validation: tests/pump-lighthouse.test.mjs includes actual revalidate/confirmation
oracles, mutation rejection, 18-account conservation, key consumption, restart,
OWNER_APPROVED crash recovery and transactional seal-failure rollback. Wallet
boundary tests cover injected and Wallet Standard paths plus capability mismatch.
All use disposable synthetic owners and controlled RPC stubs, never real proof.

References: https://docs.phantom.com/developer-powertools/lighthouse and the
recorded Lighthouse source/schema evidence from decision 097.
