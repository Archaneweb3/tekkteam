# 034 — Owner-controlled agent funding and withdrawal

## Status
Implemented behind disabled flags, 2026-09-27. No real-money acceptance performed.
Paper core and analytics formulas remain frozen; this is not Live Trading.

## Context
The existing agent_wallets table stores one address and AES-256-GCM ciphertext per
agent. The original vault uses AAD `trading:<agentId>`; production requires the
original VAULT_KEY_BASE64. Missing local vault keys with an existing database fail
at startup. Funding previously had a one-send latch but no owner withdrawal,
durable prepare idempotency, or complete reconciliation.

## Decision
Reuse that vault and agent_funding ledger; do not introduce another custody store.
New records carry kind FUND/WITHDRAW, ownerWallet, agentWallet, source, destination,
amountLamports, feeLamports, requestKey, message, validity bounds and status.
Existing receipts are retained. Legacy statuses are normalized when read; only
active legacy records can be reconciled or unsigned-expired. No Paper or launch
receipt is changed. Agent wallets remain separate from token mint keypairs.

Each request is bound to authenticated owner + agent. Funding sends owner to the
persisted agent wallet; withdrawal sends agent to that owner, never a browser
address. Both verify the encrypted secret resolves to the persisted address and
the agent's tradingWallet field. Decrypted buffers and derived signer bytes are
wiped in finally; none enter JSON, logs, frontend, localStorage or analytics.
Decrypting for an integrity check does not sign. Server signing occurs only after
the explicit withdrawal confirm request and a durable claim.

Validation reconstructs the entire legacy SystemProgram transfer message, with
exact signer, account flags, payer, amount and recipient; no other instruction or
nonce is permitted. Require positive safe integer lamports, sufficient balance
including fee, verified Mainnet genesis, fresh blockheight and 120-second review.
Fee must be available, at most 100,000 lamports and unchanged at submission.
Balance/fee/network/session/ownership/mapping/policy are rechecked before signing.
Funding is also revalidated immediately before the Wallet Standard Mainnet
sign-only prompt. The existing connected provider/session is reused, not a second
wallet state. No wallet sign-and-send method is used for this flow.

## State machine and failure policy
PREPARED -> SUBMITTED -> CONFIRMED | FAILED | UNKNOWN.
Unsigned preparation failure/cancel/expiry -> FAILED without broadcast.
Withdrawal confirmation first persists UNKNOWN as a signing claim, then persists
the derived signature as SUBMITTED before the only send. A crash during that
claim may leave UNKNOWN without a signature: operator investigation is required;
never automatically unlock, sign again, or make a replacement transaction.

BEGIN IMMEDIATE serializes reservation/claim across connections/processes. One
active request per agent, and an idempotency key binds kind + amount + owner within
that agent. Repeating it returns the same record; conflicting reuse is rejected.
Different keys cannot bypass an active request. Duplicate submit/confirm reads or
reconciles the existing record; it cannot call send again, even across restart.
RPC acceptance is not confirmation. A timeout stays UNKNOWN. Pending operations
block new transfers until resolved. Cancellation applies only before signing.

Reconciliation reads the existing signature at confirmed commitment, checks
Mainnet, cryptographic signature, exact message/source/destination/amount, slot,
fee and both balance deltas. A verified on-chain error is FAILED. Missing/mismatched
or unavailable proof stays UNKNOWN. Concurrent reconciliation cannot downgrade a
terminal receipt. No resubmission path exists. The passive 15-second worker and
owner status reads reconcile only; disabled transfer flags do not prevent recovery.

## API and UI
All paths below are under `/api/agents/:id/trading`, existing auth/ownership,
same-origin protection and no-store middleware. Normal API errors never include
vault/RPC exception detail.

- GET `/wallet`: Mainnet balance (null + UNAVAILABLE on error), flags and separate
  Wallet Activity. Never substitutes Paper funds or an unavailable balance with 0.
- POST `/funding/prepare` or `/withdrawal/prepare`: `{lamports, requestKey}`.
- POST `/funding/:operationId/review`: empty body, fresh pre-wallet validation.
- POST `/funding/submit`: `{id, signedTransaction}`; exact owner-signed message.
- POST `/withdrawal/confirm`: `{id, confirm:true}`; explicit owner consent before
  server signing. No Phantom prompt for a server-managed agent wallet.
- GET `/{funding|withdrawal}/:operationId`: reconcile only.
- POST `/{funding|withdrawal}/:operationId/cancel`: unsigned preparations only.
- Existing POST `/wallet` creates encrypted custody without funding or trading.

The UI starts with an empty manual amount. Review shows full source/destination,
balance, fee and remaining SOL. Confirmation is separate; uncertain submission
removes the submit action and offers status refresh only. Activity is independent
of Paper history. Normal UI does not expose blockhash, slot, RPC or vault internals.

FUNDING_ENABLED=false and WITHDRAWAL_ENABLED=false by default; no runtime flag is
enabled in this phase. WALLET_TRANSFERS_PAUSED=true is an independent emergency
stop for both directions, separate from GLOBAL_TRADING_KILL_SWITCH=true. Live
execution remains hard-locked irrespective of funding or wallet balance. The
existing separate Mainnet safety backend still rejects all value-moving writes.
The normal development workspace's legacy token network setting is not changed;
wallet operations independently require Mainnet genesis.

## Alternatives
Rejected arbitrary recovery addresses, a second vault, client-side agent signing,
auto-buy/autonomous trading, automatic retries, inferring success from Phantom,
and weakening the Mainnet safety backend. A pending unknown request can block
funding/withdrawal indefinitely: safety takes priority over automatic recovery.

## Verification
Deterministic temporary databases/mocked RPC and wallet test owner authentication,
origin, wrong owner, exact messages, amounts, fees, Mainnet, block expiry, vault
failure, explicit signing boundary, duplicate concurrent requests, restart,
UNKNOWN reconciliation, verified failure and receipts. Real application guards
are tested with isolated sessions. Browser QA uses the production wallet UI with
injected fixture transport at 1440 and 390; no Phantom or real transfer occurs.
Real funding followed by one real withdrawal requires later separate approval.
