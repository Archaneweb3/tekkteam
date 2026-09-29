# Controlled DEX security gate

Production hardening follow-up: see [current checkpoint](dex-production-hardening-checkpoint.md)
and ADR 041. The historical 43-test baseline and missing-component list below are
retained as the prior-phase audit; current coverage is 93 DEX / 272 total tests.
RPC inspection/reconciliation helpers and shared reservations now exist, but the
actual V2 route/CPI/value-flow gate remains unapproved. Production is still NOT_READY.

Date: 2026-09-27. Status: **NOT_READY for a real swap**.

## Scope and evidence

This review covers the isolated DEX message validator, canonical intent/risk boundary, quote adapter and separate real ledger. Deterministic synthetic route fixtures are not evidence of Jupiter route safety. No real transaction, custody signing, broadcast or live provider transaction was used by this review.

`node --test tests/dex-validator.test.mjs` passes 12 grouped tests. Coverage includes legacy/v0 messages, required lookup-table resolution, unchanged signed messages, invalid signatures, recipient/mint/input/minimum-output mutation, extra System transfer, unknown programs, writable privilege escalation, changed budget/blockhash/payer, ATA creation, reversed SELL direction, duplicate route/budget and additional signers.

## Findings resolved in validator

- Token source and destination may not be the same account or the signer wallet.
- Invoked programs may not gain writable/signer privileges, even if accidentally present in a broad account manifest.
- Output ATA creation permits only the canonical classic SPL ATA, exact ordered accounts, idempotent discriminator and safe message-level privilege union. Required creation cannot silently disappear; duplicate creation and mutable ATA mint/programs fail.
- Compute instructions must be the exact policy price/limit prefix. Other Compute instructions, unknown programs and arbitrary System transfers fail closed.
- Before signing, the persisted message hash must match. Signature verification uses the exact serialized message and sole expected agent signer.

## Mandatory trust boundaries

The route decoder registry is trusted server code. It is empty by default. A decoder must understand the complete route ABI and independently verified pool/account roles; returning fields copied from intent without validating instruction bytes is not a decoder. Browser/provider JSON must never populate this registry or the writable-account manifest.

The caller must obtain lookup-table contents, token account ownership, mint state, reserve balances, fee estimates and route account identities from verified Mainnet state. Provider-returned address maps do not establish provenance. The generic validator decodes tables but does not fetch/attest them.

Quote slippage/freshness and SOL reserve are validated by the quote/risk layers, not inferred from a provider's opaque swap instruction. The validator binds the actual decoded route amount and minimum output to those validated economics.

The real ledger is not a chain oracle: only independently verified finalized receipts may reach `confirm`. Its atomic idempotency, unique signature and immutable receipt tables prevent duplicate application; they do not replace on-chain verification.

## Executor review

Reviewed `executor.js` and `routes.js` after initial implementation. Production installs no signer, broadcaster, route adapter or automatic worker. Prepare/confirm routes explicitly reject; feature-flag changes alone cannot unlock execution.

The fixture orchestration claims PREPARED atomically before signing, persists the verified signature before a single broadcast call, and never resends SIGNED/SUBMITTED/UNKNOWN. A racing duplicate confirmation loses the PREPARED claim. Cancellation is limited to unsigned QUOTED/PREPARED. Reconciliation verifies the recorded signature and exact message before applying a receipt.

Review findings verified corrected in source:

- Newly evaluated risk snapshot expiry is rechecked after asynchronous custody/auth/policy checks, immediately before signing. A deterministic delayed-custody fixture asserts zero signing/broadcast calls.
- Receipt economic fields are whitelisted and canonical identity/slot remain authoritative. An injected effects identity mutation fixture passes without corrupting the receipt.
- Status reports the actual Live flag rather than a hardcoded false that could conceal configuration drift.

Independent final rerun of validator, executor, quote and routes tests: **43 tests PASS**. The additional late-await expiry findings are now fixed and covered: slow preparation validation cannot persist stale risk; a post-sign RPC delay or kill-switch revocation preserves the same signature as UNKNOWN without broadcasting. Checks execute after the final asynchronous owner/block-height calls and before the synchronous submit claim.

Final dedicated conclusion: no remaining demonstrated bypass in the reviewed disabled production entry points or synthetic fixture policy. This is not certification of a production Jupiter route. Shared custody spend reservation and real RPC effects extraction remain explicit production prerequisites, not implied by the fixture adapter. **NOT_READY for controlled real-money acceptance.**

## Blockers before any controlled real acceptance

1. Implement and review a pinned production route ABI, including all CPI destinations and token/pool accounts. Current Jupiter economic quote support is explicitly non-executable.
2. Implement independent Mainnet account/ALT provenance and native wrapping/unwrapping policy. Arbitrary SPL/System setup instructions currently remain rejected.
3. Verify production custody adapter, durable single-send boundary and independent finalized receipt reconciliation without changing frozen custody behavior.
4. Exercise a later separately authorized tiny BUY only after these gates pass. A SELL requires separate authorization.

The safe current outcome is a disabled, non-executable production surface, not a claim that synthetic fixture success makes Jupiter transactions safe.
