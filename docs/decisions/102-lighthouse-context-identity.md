# 102 - Validate Lighthouse deployment identity across RPC contexts

7 October 2026. Accepted source correction; release evidence in PROJECT_STATUS.

## Evidence and scope

The bounded TEKKTEAM-only archive search ended with
HISTORICAL_LIGHTHOUSE_STATE_SNAPSHOT_UNAVAILABLE. The old message transform is
already proven; the exact historical account field that failed is not recoverable.
No missing historic values are fabricated or inferred from the new code defect.

Independent finalized getMultipleAccounts and simulateTransaction responses can
have different context slots. minContextSlot is a lower bound, not an exact-slot
selector. The prior full-object account equality was an over-constraint: external
lamport credits, rent metadata and optional RPC fields do not identify code.
Sources: [Solana getMultipleAccounts](https://solana.com/docs/rpc/http/getmultipleaccounts),
[Agave bank selection](https://github.com/anza-xyz/agave/blob/master/rpc/src/rpc.rs),
[Upgradeable loader layout](https://docs.rs/solana-loader-v3-interface/latest/solana_loader_v3_interface/state/enum.UpgradeableLoaderState.html).

## Semantic invariants

The exact allowlisted Lighthouse pubkey and its derived loader ProgramData PDA
are fetched together at finalized commitment. Program: exists, executable, exact
upgradeable loader, canonical base64, 36 bytes, tag2, expected PDA pointer.
ProgramData: exists, non-executable, same loader, tag3, valid authority encoding,
deployed slot <= observed context. Pointer, deployed slot, authority, full data
hash and code hash remain unchanged from wallet handoff through final simulation
and the presend check. This does not invent exact-slot RPC behavior.

Lamports and rentEpoch are recorded and type-checked; across different contexts
they are excluded from code identity. Same-bank differences remain rejected.
Optional space is checked against decoded bytes when present; absence is not a
code change. Property order and extra presentation fields do not define identity.
All actual transaction-local readonly lamport deltas remain strictly zero under
the existing atomicExecutionEffects validator. No fee, owner, signer, writable,
Pump intent, CPI, transfer, network, simulation or debit gate is loosened.

Mainnet read 2026-10-07 01:27:22 WIB, finalized slot453981680: expected loader/PDA,
ProgramData CJ5WEjifs4d77pEA9DpewppByFjHcAkNv3YYSuSoDk7c,
deployed slot294179293, upgradeAuthority=null, full ProgramData SHA256
94aee62cffe609a6a676b0b71281c49f1aa7ed3f388bae7dcb88d3b8ca412f9a.
This is current read-only evidence, not reconstruction of the old attempt.

## Diagnostics and one explicit successor

Private append-only diagnostics capture handoff/final/presend observations before
errors return: phase, context slot, pubkey, semantic fields, hashed data and exact
failed invariant. No raw signed payload or secret is stored in diagnostics.

The latest direct user mandate separately authorizes exactly one new attempt.
Policy101 original grant/claim and failed operation remain immutable. Only the
explicit successor policy101-20261007-ret-3ed-lighthouse-diagnostic-1 is supported.
It pins parent grant/claim, failed raw payload, history, target and legacy evidence;
requires no submission/receipt, and cannot be renewed a second time. Existing
expiry/signature/transaction/mint-absence checks still run before fresh preparation.
A failed build consumes the successor; no automatic retry. Manual financial wallet
approval is separate. Agent wallet provision remains confirmed-receipt-only.

## Rollback and limits

Only TEKKTEAM API source/config may change; preserve canonical frontend and all
shared infrastructure. Restore backed-up source/config if deployment fails. Never
roll back or delete a durable grant/claim or rewrite an old execution. Real trading
remains OFF. A final message failure stops before broadcast and requires a new,
separately authorized decision; it never causes an automatic wallet retry.

## Fresh-attempt outcome and recovery read correction

At 01:34:42.086 WIB the finite successor claim was consumed, request
1a5bf85c-ef80-43c9-b2fe-66ad598e68f0. Recovery failed on getBlockHeight with
PREPARATION_RPC_ERROR / -32016 before creating a fresh operation or opening
Phantom. This is a current RPC lag failure, not a new Lighthouse validation result.
The existing bounded readAtMinimumContext helper now covers recovery reads:
only eligible finalized calls with minContextSlot retry -32016 (at most four
calls total), retaining exactly the same commitment, minimum and parameters.
Other errors fail immediately. No send/sign retry, slot downgrade, old-payload
change or grant renewal is introduced. Regression proof checks unchanged recovery
bytes, identical read parameters, bounded retries and zero sends.

The repair was deployed after 33/33 scoped VPS regressions and independent review.
It does not authorize another attempt. The consumed successor, original operation
and immutable legacy journal remain preserved. New explicit authorization is
required to prepare another operation; consequential approval stays manual.
