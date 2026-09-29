# 047 — Wire narrow CPMM production orchestration behind two closed latches

## Context

Decision 045 proved a complete unsigned CPMM envelope but deliberately left the runtime adapter and HTTP prepare/confirm disabled. Decision 046 separated authenticated, owner-confirmed Controlled Real from autonomous Live. The remaining integration gap was a trusted Mainnet state loader and a production route through the existing ledger, Risk Engine, reservation, validator, custody, and reconciliation interfaces. This wiring phase does not authorize a trade.

## Decision

Add a dedicated `/api/agents/:id/controlled-execution` route family. Requests contain only high-level intent. The server fixes the only supported pool and WSOL/USDC classic mints, reloads raw Mainnet accounts, verifies program executability and the existing CPMM PDA/schema/vault/observation checks, calculates the local quote, builds the complete transaction, and runs the full validator. Preparation persists the exact message, risk snapshot, state fingerprint, reservation, and short-lived owner capability without signing. Confirmation cannot accept transaction bytes and rechecks ownership, capability, quote/state, fee, risk, blockhash, reservation, and the persisted message before the existing durable one-shot signing state machine.

The production adapter exposes the existing Agent Wallet vault identity and single-send RPC boundary, but is instantiated with `allowValueMovement:false`. This is a second code-level latch in addition to `CONTROLLED_REAL_ENABLED=false` and fail-closed `REAL_MONEY_EMERGENCY_STOP=true`. The real route rejects preparation if the adapter is disarmed even if someone accidentally flips an environment flag. The UI shows a locked state and no working confirm action. Fixture injection exercises the same production HTTP handler with fixture signer/broadcaster; it never uses Mainnet value.

A separate authenticated `/dry-run` operation is strictly read-only and accepts only the narrow known 0.0001 SOL BUY candidate. It performs fresh Mainnet provenance, local math, Risk Engine, unsigned build, full validation, and unsigned simulation, but creates no ledger intent, reservation, capability, signature, or broadcast. Its result is observational and expires; it cannot be promoted into a preparation. The production preparation must always refresh all state and build anew before owner review.

The immutable `dex_executions` ledger uses PREPARING before expensive RPC checks, PREPARED only after atomic reservation, and terminal EXPIRED/REJECTED/FAILED states to release unsigned holds. SIGNED/SUBMITTED/UNKNOWN retain reservations for reconciliation. A separate safe audit table records prepared, cancelled, expired, rejected, and confirmed events without vault or auth material.

## Consequences

The disarmed runtime can serve read-only evidence without exposing a spending path. Controlled execution still requires a later, explicit activation phase, a real owner review UI, and fresh preflight; neither this ADR nor any dry-run result is approval for USDC BUY. Paper, funding/withdrawal, other DEXes, CPMM quote math, and the existing narrow account/instruction policy are unchanged. The signed CPMM validator branch adds cryptographic verification of the sole Agent signature while preserving the original zero-signature unsigned proof rule.

## Verification

Production-route fixture tests cover prepare/review, capability, duplicate confirmation, one fixture send, reconciliation, cancellation/expiry, and disabled/emergency negatives. Mainnet read-only checks use the same raw-state loader and unsigned validator/simulation. All flags remain closed and the production adapter is constructed disarmed.
