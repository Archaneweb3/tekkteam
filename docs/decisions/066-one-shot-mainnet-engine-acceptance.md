# 066 — Owner-authorized one-shot Mainnet engine acceptance

## Context

ADR 065 deliberately denied acceptance custody while it lacked a distinct production authority. The locked USELESS/WSOL Raydium CPMM candidate now has a separate persistent cycle, production worker and execution-port path. Normal autonomous Live remains disabled by its kill switch, and the real-money emergency stop remains the default for all other modes.

## Decision

An authenticated owner may create at most one `AUTONOMOUS_ACCEPTANCE_TEST` cycle for the server-fixed agent, wallet, mint, pool, BUY limit, slippage, and 180-second hold. This creates a narrow per-cycle emergency permission, not a global flag change. Activation itself is non-value-moving. The worker uses fresh Mainnet provenance, local quote, Risk, atomic reservation, full transaction validation, exact-message simulation, and the existing custody adapter. The acceptance state binds each execution to its immutable intent, final message, reservation, and expiry. Durable sign and broadcast claims are persisted before each side effect. A confirmed BUY creates a real position only from verified chain effects; a confirmed SELL settles actual realized PnL. One BUY and one SELL exhaust the cycle and remove its permission.

`SIGNED`, `SUBMITTED`, and `UNKNOWN` retain their locks until same-signature reconciliation proves an outcome. Restart recovery cannot create a second leg. An unsigned expired preparation may release its reservation and fail the cycle; signed or uncertain work may not. The owner can remove permission with Emergency Stop, but that does not pretend an existing on-chain outcome was reversed. Fixture tests use the same production port, claim, worker, and ledger, with injected RPC/signer/broadcaster; they do not execute real trades.

## Consequences

The only new real-money permission is the exact owner-activated acceptance cycle. Neither `CONTROLLED_REAL` nor normal `LIVE_AUTONOMOUS` inherits it. Real-money readiness still requires a fresh read-only Mainnet preflight and passing tests/build before the button may be used. No cycle is activated by deployment, restart, or this implementation.
