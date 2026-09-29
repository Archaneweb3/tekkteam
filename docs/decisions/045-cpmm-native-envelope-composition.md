# 045 — Compose narrow CPMM native envelope without unlocking execution

## Context

The legacy full validator allowed one output ATA and treated every other instruction as a swap. The canonical BUY first creates input WSOL ATA, causing ATA_MISMATCH despite correct derivation. SELL cleanup is a Token CloseAccount, not a second route. Prior isolated checks did not establish complete message support.

## Decision

Dispatch only an explicitly selected internal CPMM_CLASSIC_WSOL_USDC_V1 policy to a full unsigned state machine. Preserve the old validator default and quote/provenance/math. The narrow policy supports the already-proven pool only; it does not generalize Raydium or token programs. Recompute quote and ATA addresses from verified raw state. Enforce complete ordered setup, exactly one swap, exact Agent cleanup, exact privileges, zero signatures, and no extras. Check raw existing ATA ownership/mint/initialization/delegation/close authority/native reserve; missing state permits only exact idempotent creation.

SELL test pre-state is deliberately synthetic, separate from Mainnet and DB. No hash or fixture address bypass is used. Historical canonical bytes and fresh unsigned simulation both pass the same structural rules.

The disabled production dependency boundary exposes unsigned proof internally, but execution build/snapshot/policy throw CPMM_EXECUTION_DISABLED and no signer/sender exists. HTTP prepare/confirm remain blocked. Neither flags nor fixture support grants spending authority. This is readiness for a separately authorized controlled acceptance setup, not autonomous execution readiness.

## Consequences

BUY/SELL full-envelope positives and mutations replace the prior composition blockers. Live acceptance must independently refresh state, fee/blockhash/rent and risk review, resolve capital shortfall through user authorization, and retain the existing source/deployed-binary trust assumption. No custody, reservation, funding, withdrawal, Paper or quote math changed.

## Verification

See ../cpmm-full-envelope-checkpoint.md. 394 tests pass twice consecutively; build passes. Unsigned Mainnet BUY simulation is evidence only. No transaction broadcast or value movement.
