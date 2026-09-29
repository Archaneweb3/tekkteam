# 039 — Controlled DEX provider quote boundary

## Context
The verified custody and Paper subsystems remain frozen. Repository search found
no existing Jupiter router/quote execution integration in `src` or `server`.
The implementation needs an independently validated final message, not blind
signing of a provider response. No real quote, prepare, signing, or swap was used
to implement this layer; tests inject HTTP fixtures.

## Decision
Use Jupiter Swap V2's **GET `https://api.jup.ag/swap/v2/build`** as the candidate
quote/instruction provider. Current official docs inspected on 2026-09-27:

- [Build guide](https://developers.jup.ag/docs/swap/build)
- [Build API reference](https://developers.jup.ag/docs/api-reference/swap/build)
- [Legacy migration notice](https://developers.jup.ag/docs/api-reference/swap/v1/swap)

V1 is superseded; do not implement guessed legacy `/quote` + `/swap` endpoints.
V2 `/build` requires a server API key and returns a quote with raw instructions.
The guide assembles v0 transactions with lookup tables; setup can create ATAs,
cleanup can unwrap SOL. Its Compute Budget response provides price, not a limit;
limit estimation requires simulation. The guide allows own-RPC submission.
Do not use managed `/order` + `/execute`, which lacks our transaction control.

The isolated adapter `server/dex/quote.js` consumes only quote economics and
deliberately **discards all instructions and lookup tables**. There is no signer,
custody access, submit endpoint, or execution authorization in this adapter.
Input is a server-authorized intent with `direction`, Mainnet network, agent
wallet, input/output mints, decimal integer `inputAmount`, and `slippageBps`.
Output is `executable:false`, provider, immutable route/economic snapshot,
`estimatedOutput`, `minimumOutput`, price impact if supplied, local timestamps,
and a SHA-256 reference bound to the wallet. A quote is not an executable order.

The initial adapter accepts only one 100% direct ExactIn route. Numeric slippage
must match the intent and server ceiling (default 100 bps, hard configuration cap
500 bps); dynamic/RTSE slippage is not requested. Minimum received must be positive
and at least floor(estimated output * (10000 - bps) / 10000), with u64 integer
arithmetic. Estimates remain estimates, not guarantees. Route labels are display
data, not program authorization. No tips, referral account, payer override, or
destination override is requested; nonzero integrator platform fees are rejected.
Underlying pool fees can affect output; quote minimum/output are not network fees.

Local quote lifetime starts **before** HTTP retrieval, defaults to 15 seconds,
and is capped at 30 seconds. Slow responses cannot reset freshness. HTTP uses a
fixed HTTPS endpoint, no redirects, bounded body, timeout, no retry, and redacted
errors. Missing API configuration/provider failure means QUOTE_UNAVAILABLE, never
fallback dummy economics. Local freshness does not prove a malicious provider's
market data is current; final preparation must independently verify chain state,
blockhash lifetime, fresh balances and simulation before review.

## Security boundary / remaining prerequisites
Official high-level docs describe opaque router instructions, not a proven full
ABI/account-role/inner-CPI policy for every route. **No production router decoder
is approved by this ADR.** A Jupiter program ID alone is insufficient. Execution
must reject until a narrow route's pinned ABI, pool state, account provenance,
writable roles, mint/amount/minimum-output semantics and CPI programs are proven.
ALT contents must be independently resolved from Mainnet RPC, not trusted from
the provider response. Token accounts must be independently verified, including
owner, mint, token program and rent; Token-2022 extensions need explicit handling
or rejection. WSOL setup/cleanup and any account-closing recipient must be decoded.

Future network fees and ATA rent must be computed from RPC separately from price,
and the SOL reserve must cover buy, rent, future sell and safety funds. The exact
reviewed message must be persisted and signed unchanged, with signature locally
verified and a single broadcast attempt. Unknown outcomes reconcile that same
signature. Finalized on-chain account deltas, actual fees, token amounts and
transaction effects must independently establish receipts/real positions.

## Verification
Deterministic HTTP fixtures cover BUY/SELL economic extraction, exact intent
binding, TTL/slow response, wrong mints/amount/mode, slippage, malformed/u64 values,
route/fee rejection, unavailable provider, secret-redacted errors and bounded
responses. These tests prove adapter behavior, not Mainnet route executability.
No frozen subsystem or environment flag is changed by this workstream.
