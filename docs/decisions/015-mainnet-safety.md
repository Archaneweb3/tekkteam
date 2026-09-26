# Separate Mainnet safety environment

Status: Accepted for diagnostics only; production release blocked
Date: 2026-09-26

## Context
Devnet RPC and Phantom preview disagree. That does not justify changing production transaction construction or enabling real-fund transactions. Existing Devnet code can broadcast and reconcile pending submissions.

## Decision
Use an explicit DEVNET/MAINNET registry. Mainnet requires MAINNET_SAFETY_MODE=true, a separate RPC setting and an isolated database. Its adapter exposes reads and a fixed unsigned Memo preparation only. All agent mutations and reconciliation are blocked. No Mainnet mint, token account, launch program or trading integration is configured. Verify Mainnet genesis and Memo executable account before constructing a diagnostic. Frontend Devnet broadcast requires explicit backend permission.

Use a separate local diagnostic page; do not change or ship the historical Devnet diagnostic. Never approve a preview. Returned signatures, if unexpectedly supplied, are discarded. A successful preview would not authorize enabling broadcasting.

## Alternatives
Rejected global replacement and reusing Devnet state: these could replay submissions or mix accounts. Rejected claiming a production fix from a public RPC simulation: Phantom must be observed separately.

## Consequences
Production remains the existing static demo. A Mainnet readiness pass is not a launch implementation. Public RPC browser access may be denied; an approved browser-compatible RPC or properly secured read-only backend transport is needed before completing the preview test. Historical Devnet evidence remains unchanged.
