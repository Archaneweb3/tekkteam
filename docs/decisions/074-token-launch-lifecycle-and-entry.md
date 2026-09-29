# 074 — Token lifecycle and Prepare attempt are separate product states

Status: Accepted

## Context

Agent Settings contained the primary Pump.fun launch form. A historical receipt with a mint and signature could be displayed beside a newer `PREPARATION FAILED` message, making a failed attempt look like a failed token and a stored mint look like a verified launch. The current real receipt is `Failed` after blockhash expiry; its last Prepare attempt was `PREPARED`. Neither the transaction nor mint was found on the configured Mainnet RPC. Zero initial buy is supported by the existing launch construction.

## Decision

The authenticated Agent Hero owns the token lifecycle entry. It opens a focused owner launch drawer; Settings keeps only token status and a link to that drawer. The existing Prepare, owner wallet approval, and Submit handlers remain the sole transaction path. A client projection derives token lifecycle from the canonical launch receipt and treats the attempt journal as a separate diagnostic. `Success` is shown as launched only when confirmed and bound to a mint and signature. Any receipt with a signature or broadcast claim blocks a fresh Prepare in the UI; a failed signed receipt is labeled as an unconfirmed historical transaction, not a preparation failure or a launched token. Mint and signature are visually shortened with full-value copy controls.

`GET /pump-launch/status` now adds `latestAttempt`, an allowlisted projection of the most recent Prepare attempt for the authenticated agent. It does not change receipt status, authorize retry, or alter the launch state machine. A missing receipt remains `Idle`; a failed Prepare attempt without a receipt remains a distinct attempt result. Backend Prepare conflict rules still govern whether a new operation is possible.

## Consequences

The UI can show `TOKEN LAUNCHED` and `LATEST PREPARATION FAILED` independently without conflating them. Historical signed receipts cannot be mistaken for safe new-launch opportunities. The move changes product navigation and presentation only; payer, initial buy, transaction construction, custody, signing, broadcast, and reconciliation policies are unchanged. The drawer does not auto-Prepare or auto-approve.
