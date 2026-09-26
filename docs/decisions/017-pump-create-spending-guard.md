# Fail-closed Pump creation readiness guard

Status: Accepted for unsigned readiness inspection only
Date: 2026-09-26

## Context
The user requires official Pump create_v2 with zero initial buy and an absolute payer debit cap of 10,000,000 lamports. A public metadata URI and payer/creator are approved. Simulation alone is explicitly insufficient. No signing or broadcasting is authorized.

## Decision
Build an isolated unsigned candidate using a pinned official IDL schema. Decode the final message and compare all expected account privileges, data, payer, blockhash and network. Reject unexpected instructions and unknown fees. Reject the canonical create_v2 as UNPROVEN_CPI_PAYER_DEBIT because its CPI debits have no reviewed absolute bound. Stop before simulation when spending validation rejects. Do not add a production wallet entry point or widen the existing RPC proxy.

## Consequences
The candidate and exact bytes can be audited, but are not ready for signing or a live test. RPC fee quotation does not certify internal rent or protocol debit. The guard is fail-closed rejection, not an on-chain balance guard. Any future enforceable design requires separate review, and simulation must never be promoted to a hard cap guarantee.
