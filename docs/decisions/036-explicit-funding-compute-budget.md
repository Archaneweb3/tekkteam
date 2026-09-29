# 036 — Explicit final funding message and fee policy

## Status
Implemented behind disabled funding, 2026-09-27. Real-wallet acceptance pending.
Extends 034/035; withdrawal and legacy receipt reconciliation remain compatible.

## Context
The captured Edge transaction prepended price 375000 micro-lamports/CU and limit
200000 CU. The owner signature verifies but the message differs from the prepared
transfer-only message. Accepting it would bypass the reviewed fee. It was rightly
rejected before broadcast.

## Decision
New funding preparations use version 1: price instruction, limit instruction,
then exactly one System transfer. Default 10000 CU with an explicit zero priority
bid is a conservative policy for a simple builtin transfer, not a congestion
oracle. No inclusion guarantee; expiry requires separate manual resolution.
Server ceilings: 10000 CU, 100000 micro-lamports/CU, 1000 lamports priority,
10000 lamports total fee. No browser-configurable overrides. Current default
priority fee is zero. A policy change requires a newly reviewed preparation.

RPC getFeeForMessage must return a valid fee for the complete final message;
unavailable, excessive or changed quotes fail closed. Priority fee is rounded up
from limit times micro-lamport price / 1000000; base fee is the RPC total less that
priority fee. The UI shows base, priority and estimated/maximum network fee
separately from transferred SOL. Review and submit requote the same final message.
Reference: https://solana.com/docs/core/fees

Stored/public quote fields add fundingMessageVersion, messageHash (SHA-256),
computeUnitLimit, computeUnitPrice, baseFeeLamports, priorityFeeLamports,
maxPriorityFeeLamports and maxNetworkFeeLamports. Existing feeLamports is the total.
Blockhash, validity height, amount, serialized message and transaction remain.

Exact reconstruction covers accounts, flags, instruction bytes and order. Returned
message equality against persisted bytes precedes signature verification. Fee
ceilings are independently checked before the durable broadcast claim. No
normalization, stripping, arbitrary instructions or semantic-only acceptance.

## Historical evidence and verification
The captured signed payload lives ONLY in tests/fixtures. Offline tests compare
it to the original expected digest (reject) and the independently reconstructed
historical configuration (equality/signature pass). The latter is a test-only
approved comparison, not authorization under today's tighter production ceilings:
fundingFees rejects that historical configuration. Nothing replays this payload.

Synthetic test keys cover recipient, amount, extra transfer/program, payer,
blockhash, request, price, limit, order, duplicate budget, flags and invalid/missing
signatures. API tests cover fee failures, persistence, idempotency and full-message
reconciliation. Existing historical request 23034a47-2072-4dc5-a1a0-ba15e2355002
must not be migrated or cancelled by implementation. Resolve it separately.

## Alternatives
Rejected ignoring wallet-added Compute Budget, accepting equivalent transfers,
copying the wallet's expensive configuration into production defaults, or retrying
after rejection. A wallet that still alters the final message remains rejected.
