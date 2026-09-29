# 040 — Isolated controlled execution scaffold, production fail-closed

## Context
The verified Agent Wallet custody/funding/withdrawal and Paper engine are frozen.
No existing production DEX adapter exposes a verified, arbitrary-message signing
boundary. The funding/withdrawal signer is private to its fixed-transfer module.
Copying or widening that guard just to run a swap would invalidate its security
assumptions. ADR 039 selects current Jupiter V2 economic quotes but approves no
route ABI. Synthetic fixture success is not proof of a safe Jupiter transaction.

## Decision
Add isolated modules under `server/dex`, with only two integration points:
authenticated API installation in `server/app.js` and a collapsed Agent Detail
surface in `public/app/workspace.js`. No Paper or custody implementation changes.
Keep `CONTROLLED_REAL_ENABLED=false`, Funding/Withdrawal/Live false and global
trading kill switch true. Unlike owner wallet transfers, the controlled swap
fixture engine also honors the global trading kill switch. A later real test
must explicitly resolve that policy; it must not silently bypass the switch.

Production can retrieve non-executable economic quotes when a server-only
`JUPITER_API_KEY` is configured. No key/provider means QUOTE_UNAVAILABLE. Quote
retrieval does not decode a token's on-chain account or authorize trading it.
`prepare`/`confirm` always reject UNVERIFIED_ROUTE_ADAPTER. Production has no
signer, broadcaster, real adapter, autonomous worker or fake executable quote.

Canonical TradeIntent binds owner, persisted Agent Wallet, agentId, direction,
Mainnet, input/output mints, positive u64 input units, slippage and config version.
Server authority supplies ownership/wallet; timestamps do not alter the stable
intent fingerprint. Same owner/key + changed canonical intent conflicts. An active
record blocks a new intent. Explicit cancellation only ends unsigned QUOTED or
PREPARED. UI retains/restores pending identity across edits/remounts, does not
silently cancel or requote, and never retries uncertain outcomes.

Risk checks are distinct from token selection/strategy and accept an independently
verified adapter snapshot. Max slippage is 100 bps. Conservative implementation
ceilings are 1,000,000 lamports per BUY, 10,000 lamports network fee, 2,000,000
lamports safety reserve plus 10,000 future SELL fee, and separate exact ATA rent.
These are guardrails, NOT selection of a real test amount. Risk snapshot expires
in 10 seconds; intent in 30; quote defaults to 15. No production adapter currently
fetches/attests the required mint/token/ATA/ALT/pool snapshot.

Fixture preparation persists the final message/hash, quote/reference, intent,
risk reference and review economics. Confirmation binds hash and quote reference,
rechecks authorization, risk/balance/fees, blockhash, custody and switches. The
atomic PREPARED→UNKNOWN claim precedes signing, so concurrent confirmations cannot
both sign. Only the exact final message may receive a valid sole Agent signature.
SIGNED with signature is durable before SUBMITTED and exactly one send attempt.
Failure/timeout preserves UNKNOWN and the same signature; reconciliation never
resends. Crash after claim but before signature requires operator diagnosis, not
automatic retry. Late expiry/revocation after signing remains non-broadcast UNKNOWN.

## Real ledger and accounting
Only `dex_*` tables are added. Append-only state events and immutable finalized
receipts are separate from mutable execution projections. Receipt signatures are
unique; confirmed position application is atomic and idempotent. Reconciliation
requires independently validated finalized message/signature, exact input, minimum
output, fee/rent and SOL/token deltas. An arbitrary provider success response is
not evidence. Actual production RPC effects extraction is still missing.

REAL positions never write Paper tables. BUY cost basis = confirmed SOL input +
network fee; ATA rent is tracked separately as recoverable account capital, not
swap price. SELL uses proportional integer cost-basis allocation (final close takes
all remainder), actual SOL proceeds less fee, and realized PnL against that basis.
An untracked external token balance cannot be sold into fabricated cost basis.
Unrealized PnL is not invented. Finalized failed transactions retain fee metadata
on the FAILED execution; portfolio-level failed-fee/rent-recovery accounting is a
remaining production prerequisite. No position exists before confirmation.

## HTTP and UI
- GET `/api/agents/:id/controlled-swap`: owner-only locked status and own records.
- POST `.../quote`: manual canonical intent, stable requestKey; economic snapshot.
- POST `.../:executionId/cancel`: explicit unsigned cancellation, empty body.
- POST `.../prepare` and `.../confirm`: always reject; no execution dependencies.

UI says REAL SOL / MANUAL APPROVAL REQUIRED, estimated output, minimum received,
slippage and optional price impact. Unknown network fee/ATA rent/reserve say
Unavailable, not zero. Amount is explicitly raw integer base units; no unverified
token decimals, default mint or nonzero amount. Prepare/confirm are disabled.
1440/390 QA uses injected fixtures clearly labelled as fixtures; not real balances.

## Remaining production gates
1. Pinned, independently audited narrow route ABI, all writable account roles,
   pool/token provenance and CPI program semantics, native SOL wrapping/cleanup.
2. Actual Mainnet mint/ATA/ALT/simulation/fee/reserve and finalized-effects adapters.
3. Approved reuse of custody signing boundary without weakening frozen transfer
   guards, plus shared durable spend reservation against funding/withdrawal.
4. Real-fee/rent lifecycle accounting and crash-recovery acceptance for the adapter.
5. Explicit user-approved token and amount, final review, switches and later BUY
   authorization. SELL needs its own separate authorization.

Until these are satisfied the system is NOT_READY for a real controlled swap.
