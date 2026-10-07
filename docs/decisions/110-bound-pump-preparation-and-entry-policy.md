# 110 — Bound Pump decisions and immutable entry policy

7 October 2026. CURRENT: unmounted preparation-only composition. No production
consent, funding, signer, sender or execution worker is enabled.

The bound decision adapter reads exactly the receipt-bound mint. It reuses
`strategyIntent(..., signalOnly:true)`, integer personality sizing, and the
existing Real quote/exit functions. Paper balances/fills and the CPMM discovery
orchestrator are excluded. Source provenance, fresh metrics/capital/venue,
unchanged signed strategy, reserve, holds, all-in fee/rent budgets, transaction
counts, cooldown and position evidence are prerequisites. Missing proof means
WAIT. A SELL decision expires no later than its verified valuation quote.

The original reservation budget exposes a synchronous availability projection;
it is not a second ledger or a reservation. Every actual reserve/claim rechecks
the original authority and counters. Session renewal cannot reset daily spending.
Custom strategy caps can only tighten the grant and system limits.

Trusted decision ports bind the complete decision intent to its consent before
the existing executor derives a budget. Consent changes or higher prepared
fee/rent costs invalidate that proof. The coordinator stops at an unsigned
preparation; UNKNOWN always reconciles/blocks before another market decision.

First confirmed BUY stores the frozen consent strategy, opening receipt and
backend finality-observation timestamp. That timestamp is not chain block time.
Partial SELL preserves this entry policy. Historical positions lacking it remain
unqualified for automatic exits. One-position protection runs before preparation
and signing claim. If an already-existing authoritative transaction nevertheless
reports another BUY, its effects must be accounted for and the Agent paused for
recovery; confirmed chain facts must not be discarded to enforce preflight policy.

Tests use disposable SQLite, fixture signatures and synthetic unsigned bytes for
composition. They do not qualify Pump on-chain trading. The real target wallet is
unfunded, first-BUY creation/CPI effects remain unqualified, and its estimated
account rent exceeds the unchanged 500,000-lamport session/day limit.
