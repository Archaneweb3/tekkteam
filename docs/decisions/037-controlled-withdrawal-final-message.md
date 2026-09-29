# 037 — Controlled withdrawal final-message review

## Status
Implemented for manual acceptance; no real withdrawal executed by implementation.

## Context
Funding acceptance proved the explicit Compute Budget message. Withdrawal still
used a transfer-only message and did not show base/priority fees or owner balance
after receipt. Enabling it before closing those gaps would violate the requested
acceptance procedure.

## Decision
Reuse policy 036 unchanged for new withdrawal preparations: price 0, limit 10000,
then exactly one System transfer from persisted custody wallet to authenticated
owner. The historical fundingMessageVersion field denotes this shared format for
both directions; no migration of prior receipts or new custody identity.

The server fetches the destination owner balance during preparation and again
before signing. Quote adds destinationBalanceLamports and
expectedDestinationBalanceLamports. Invalid/unavailable balances fail closed.
Review displays source balance, base/priority/total fee, expected agent remaining,
and expected owner balance after receipt. Amount remains empty until user input.

Explicit confirm:true is required. Existing policy/session/ownership/mapping,
Mainnet, fee, solvency, expiry, persisted message/hash and instruction checks run
before the durable UNKNOWN claim. Custody signs only after that claim. A new
post-sign comparison requires signed message == persisted message as well as
cryptographic signature validity before persisting the signature and one send.
Signature/secret material never enters review or logs. No Phantom is required.

## Verification
Isolated tests cover full-message withdrawal, owner destination locking, no
signing at preparation, exact message after signing, RPC destination-balance
failure, idempotency/restart, duplicate confirms, and UNKNOWN reconciliation.
Real acceptance is pending explicit user input/confirmation in Edge. Funding and
Live Trading remain disabled; enabling withdrawal alone is a separate preflight
checkpoint, not permission for an automated prepare/confirm.
