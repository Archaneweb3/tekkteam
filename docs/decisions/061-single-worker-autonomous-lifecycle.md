# 061 — Single-worker autonomous lifecycle, fail-closed by default

## Context

Decision 060 left the production autonomous execution port constructed but unscheduled. Paper already has a bounded 15-second worker. A second timer would allow two independent scheduling authorities and make restart or pause races harder to reason about.

## Decision

Bind the autonomous scheduler to that existing worker tick, with a separate durable `dex_autonomous_lifecycle` table. A restart pauses Live rows and requires explicit owner resume. The scheduler first reconciles any signed, submitted, or unknown execution by its original ID even when the agent is paused; it never makes a new market decision on that reconciliation tick. One in-process tick per agent is permitted. The ledger's durable active-execution and reservation guards remain the cross-process backstop.

Owner start/resume must pass the real-money Mainnet identity, custody mapping, circuit-breaker, unresolved-execution, and protected-capital checks. The execution port independently re-reads current lifecycle state before signing and broadcast. A pause may not erase or release an uncertain submitted operation. Paper state, Paper history, and Paper execution remain separate. The production venue remains only the verified WSOL/USDC Raydium CPMM pool; unsupported candidate mints are skipped.

The backend exposes owner-scoped lifecycle/status operations and a deduplicated, non-secret runtime event stream. Default environment flags continue to prohibit Live execution. Fixture passes are necessary but do not by themselves authorize a Mainnet autonomous test.

## Consequences

There is one scheduling cadence, not a new trading loop. On restart, pending chain reconciliation continues but no autonomous decision resumes without owner action. Future enablement still requires full production scheduler failure-matrix coverage and a controlled Mainnet acceptance decision; changing flags alone is not evidence of readiness.
