# 079 — Server-derived Agent Wallet transfer capabilities

Status: Accepted

## Context

The shared Manage Wallet drawer exposed Deposit and Withdraw, but both buttons were tied to global feature flags and displayed only generic disabled copy. A real token position remains open on the current Agent. The UI must not infer that a positive SOL balance makes withdrawal safe.

## Decision

The authenticated Agent Wallet status response now provides `depositCapability` and `withdrawCapability`, each with `available`, a stable reason code, and concise reason. Both the shared drawer and backend transfer endpoints use the same server-side transfer policy. Withdrawal additionally checks the real-position, DEX-execution, and real-reservation ledgers before MAX, preparation, and confirmation. Unknown or missing safety state fails closed. Existing wallet-transfer idempotency, confirmation, exact-message and custody controls are unchanged.

Deposit still requires the global Funding gate, owner authentication, verified Mainnet and wallet mapping. Withdraw still requires the global Withdrawal gate and validated Agent custody. An open REAL position blocks SOL withdrawal regardless of Paper scanner state. An unsigned historical or in-progress wallet request is governed by the existing wallet transfer ledger; no on-chain operation is created by reading status or MAX.

SPL holdings are read fresh from both token programs. An empty successful read is distinct from unavailable RPC data. The same drawer is reused from Settings, Delete Agent and the Wallet workspace.

## Consequences

The current Agent can accept an owner-initiated Deposit when the gate is enabled. Its open REAL position keeps Withdraw disabled with an explicit `REAL_POSITION_OPEN` reason. Refresh remains read-only and available. No flag, UI state, or positive balance overrides the backend withdrawal guard.
