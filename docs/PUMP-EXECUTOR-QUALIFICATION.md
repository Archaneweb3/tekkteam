# Pump Executor Qualification Contract

CURRENT 2026-10-04: `pump-finalized-reader.js` now provides an unmounted read-only
DI reader for an existing UNKNOWN bonding-curve ledger signature. Only genesis,
signature status and finalized base64 transaction calls are permitted by its code;
no retries, signing, broadcast, environment/config fallback or storage. It checks
immutable plan/intent, source, Mainnet, exact status/transaction slot/error, canonical
signed bytes and cryptographic payer. Missing/pruned/nonfinalized evidence stays
unresolved. Sanitized provider failure preserves UNKNOWN/reservations through the
existing adapter/executor. JSON-reloaded expired policy still reconciles only the
same signature; fixture evidence remains fixture. RPC deadline/transport trust are
caller responsibilities; this module is not registered or execution-qualified.
See official [getTransaction](https://solana.com/docs/rpc/http/gettransaction) and
[getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses).

Nonzero buyback remains PENDING_EXTERNAL_SPECIFICATION: the pinned official IDL
and recipient docs define fields/ordering but not the fee base, gross-versus-retained
event fee, rounding or remainder destination. SDK protocol/creator calculations do
not prove that split. Keep `BUYBACK_SPLIT_UNQUALIFIED`; an observed recipient credit
alone is not permission to settle normal-curve trades. Required primary evidence:
version-bound handler/math specification plus genuine authorized corroborating
atomic event/CPI/balance evidence. No extra transaction lookup was performed.

CURRENT 2026-10-04: `pump-finalized-effects.js` supplies a pure, unmounted accounting
verifier for the zero-buyback bonding-curve subset. The canonical adapter persists a
DERIVED effect policy in the existing immutable plan: pinned SDK/IDL, ordered ABI
accounts/roles, selected recipients, creator/mint/wallet, exact unsigned bytes and
digests. Reconciliation checks the complete plan digest and intent fingerprint,
cryptographic signature, canonical serialized landed bytes, atomic native/token
metadata, Pump self-CPI event, balanced invocation logs, transfer CPIs, ceil fees,
budget/minimum output and reserve. Historical finality never rebuilds an expired
quote. Failed finalized transactions require fee-only effects; rejected/unknown
evidence retains its hold. No signer, sender, route or default qualification is
supplied. LOCAL_FIXTURE stays LOCAL_FIXTURE through durable restart/settlement.

Qualification still requires trusted bounded Mainnet transport integration, authoritative M4
receipt and Agent-wallet/account binding, and full mutable program/account-state
qualification. `getTransaction.meta` cannot prove raw curve/volume-account state.
Nonzero buyback split semantics, sharing/cashback/rewards, PumpSwap, account creation,
rent/refunds and legacy truncated events deliberately reject. BUY volume/creator
auxiliary accounts must already exist too. Do not assume normal coins have zero
buyback; do not add fee+buyback without proven attribution. This source increment
does not establish a real trade, executor activation or M6 PASS.

CURRENT 2026-10-02 reconciliation: the later scoped assignment already implemented
default-off Pump runtime registration, local DI curve/PumpSwap adapter preparation,
asset-aware reservations, atomic receipt/expense/position settlement, durable UNKNOWN
and passive same-signature finality recovery. See decision094 and
artifacts/launchpad-continuation/direct-delivery/runtime-handoff.md. Earlier quote-only
and unmounted-adapter descriptions describe the decision093 snapshot, not current code.

The existing controlled CPMM exact-debit paths remain unchanged. Default Pump routes
have no signing/broadcast ports; no production adapter or worker is installed.
readSnapshot, simulateUnsigned, readFinalized and verifyFinalizedEffects are explicit
dependencies in pump-runtime-adapter.js. The new read-only reader is unmounted;
actual transport integration and complete pool/program/state effect qualification
remain unqualified. Local DI accounting is
DERIVED/LOCAL_FIXTURE and creates no qualified production position or receipt.
Historical program/global account reads do not qualify an associated mint or pool.

## Ordered Gates

| Gate | Source acceptance | External acceptance |
| --- | --- | --- |
| Account snapshot | Bind canonical owner/Agent/associated mint, program IDs, all required roles and a consistent context; reject missing/unsupported/provisioning | Authorized read-only Mainnet genesis, deployment and account evidence; pin alone is insufficient |
| Asset-aware reservation | Curve BUY reserves maximum native SOL trade budget separately from native fee/rent; PumpSwap BUY reserves maximum WSOL budget plus separate native fee/rent; SELL reserves exact associated token amount; no WSOL/SOL interchange | Actual wallet balances and account state, no automatic funding/wrapping |
| Quote contract | Typed BUY budget with maximum debit/minimum output versus SELL exact input; immutable quote/context/expiry and effective policy revision | Fresh authorized RPC snapshot and real venue quote/simulation evidence |
| Envelope | Exact intent/message/account roles, unsigned simulation and immediate owner/Pause/kill/revision/expiry rechecks; no unrelated instructions | Qualified full program/deployment and any separately authorized provisioning contract |
| Fee/rent | Bound native fee separately; explicitly account for creator/protocol/buyback destinations and rent ownership; no silent deduction from input | Authentic account effects and fee evidence, not abstract conservation alone |
| Final receipt | Exact message/signature/owner/mint and network; finalized successful canonical transaction, unique durable receipt | Actual signed/finalized transaction requires separate authorization |
| Position/PnL | Only accepted durable finalized trade effects update asset-aware positions; fees/rent and realized/unrealized provenance distinct | Price provenance required for valuations; UNAVAILABLE if absent |
| Recovery | Journal before possible send; UNKNOWN retains same signature/intent and reservations, no replacement/rebroadcast; Pause does not liquidate | Actual worker restart/finality evidence separately qualified |

## Local Regression Requirements

1. Budget dust must release only the unspent portion of the same reserved asset
   after an accepted receipt (native SOL for curve BUY, WSOL for PumpSwap BUY);
   it must not weaken the existing CPMM exact-input contract. Reject debit above
   budget, below-minimum output, mixed asset units and duplicate release.
2. Failed/unsigned/simulated/pending/UNKNOWN transactions create no trade receipt,
   position or PnL. Pending recovery preserves reservations until authoritative
   terminal resolution. A transient missing RPC transaction is not terminal failure.
3. Reject unrelated mint, owner, delegated/frozen authority, mutated account role,
   expired quote and policy changes across every asynchronous stage. Curve completion
   does not itself establish a canonical migrated pool or authorize rerouting.
4. Reconciliation is idempotent across process restart and conflicting concurrent
   observations; historical Paper/Devnet/UNKNOWN provenance never becomes Mainnet.
5. Pause and all kill switches block new preparation/submission while passive
   reconciliation remains non-executing. No recovery callback may sign or send.

## Delivery Boundary

Local asset-aware reservation/receipt integration is implemented and independently
reviewed under the later exact contract; do not recreate it because of the historical
quote-only wording. Production installation/activation remains unauthorized. The
remaining source work for a real reader/effect decoder needs an authoritative target
account/transaction evidence contract (including fee/rent/provisioning and finality),
then offline fixtures and negative cases before external qualification. An injected
test verifier returning trusted effects is not that decoder.

Publisher qualification is independent: it cannot qualify a trade venue. Association
must come from canonical owner/Agent/application intent records; standalone finalized
success cannot supply it. No new transaction/history lookup, simulation, signing,
funding, publication, deploy or Live activation is authorized by this reconciliation.
