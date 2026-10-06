# 096 — Informational costs and action-time Solana transaction

Accepted 6 October 2026. Scope: explicitly enabled staging M4, same saved owner,
Agent and coin, initial buy zero and reviewed debit ceiling 0.01 SOL.

The former execution package had a 30-second wall-clock lifetime shared by quote,
operator inspection and wallet approval. It expired while the owner was reviewing
Phantom. Extending this timer would retain the architectural coupling.

An informational estimate now creates no durable execution or wallet authority.
Continue to Wallet builds a fresh immutable package, checks current Mainnet context,
fees, reserve, rent, complete writable-account effects and simulation, then obtains
a fresh native validity observation. Construction must still finish in 30 seconds.
The final v2 package has no artificial wallet decision TTL: recentBlockhash and
lastValidBlockHeight govern expiry. Handoff requires at least 50 remaining blocks
and an observation no older than ten seconds. These checks never replace message
fields. See [Solana confirmation guidance](https://solana.com/developers/cookbook/transactions/confirmation).

Wallet delivery has a durable one-time claim bound to exact execution, review
digest and unsigned bytes. A lost preparation response can replay only until this
claim; a lost claim response cannot reopen the wallet. Owner signs first; the stored
mint signature is added only to the identical returned message. Exact fingerprints
cover prepared, delivered, returned and fully signed bytes.

After owner signature, all financial/security checks run again; native validity is
checked after those reads and once more immediately before durable SUBMITTED claim
and the sole network send. Pre-claim refusal is SIGNED_NOT_BROADCAST. Any uncertainty
after that claim remains reconciliation-only, with no automatic rebroadcast/retry.

Explicit Prepare Again preserves immutable history and requires finalized expiry,
absence of prior signature/transaction where available, and mint absence. A crash
at durable SIGNED may use the same proof only for v2 with no submission claim.
No new Agent or wallet is created until authoritative finalized receipt binding.

Default capability is OFF. Existing v1 reviews retain their original semantics.
Trading, funding and production activation are unchanged. Rollback disables the
new capability, but any signed/submitted record must be reconciled without mutation;
never reset one-shot history or replace the database to unblock a launch.

Validation: disposable fixture tests distinguish source contracts from real wallet
and Mainnet evidence. Real launch and production parity remain incomplete until
the separately required human approval, receipt and downstream acceptance exist.
