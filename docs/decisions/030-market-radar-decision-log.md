# 030 — Market Radar and bounded Decision Log

## Status
Accepted, 2026-09-27.

## Context
Paper decisions already use StrategyConfig, TradeIntent and a fail-closed Risk
Engine. Activity projected only selected snapshot fields, so the UI could not
explain the exact market values or which risk checks ran. The engine evaluates
one configured mint per agent, not a multi-token discovery universe.

## Decision
Observe the existing tick, without introducing another evaluator. RiskResult now
records booleans as its existing predicates run, in the same order. Later checks
after a rejection remain unknown/not evaluated. The frontend displays server
facts, not independent signals or confidence scores.

Each tick replaces a single Radar snapshot in paper_states. A material transition
(signal flags, config version, final decision, position state or rejection reason)
or a BUY/SELL also persists a whitelisted snapshot in paper_decisions. Snapshots
contain source market facts, evaluated config/version, signal thresholds/results,
TradeIntent, actual RiskResult and deterministic reason. Existing positions keep
their entry configuration as specified in ADR-029. A saved newer version is not
misrepresented as the version used by an older evaluation.

Owner-authenticated read-only endpoints:
- GET /api/agents/:id/trading/radar: agentId, status, scope, configuredMint,
  serverTime, current configVersion and zero/one actual evaluated opportunities.
- GET /api/agents/:id/trading/decisions?filter=all|trades|skipped|risk:
  agentId, decisions and retention metadata. Invalid filter: 400. Other owner's
  agent: 404. These endpoints never fetch quotes, evaluate or execute trades.

OFFLINE is never-started; PAUSED does not scan. SCANNING is an in-flight tick;
WATCHING is the last valid evaluation. Invalid/missing data yields ERROR. Quotes
older than 30 seconds, explicitly stale, or >1s in the future yield STALE_DATA.
GET also rechecks age, so stopped ticks cannot leave a fresh-looking snapshot.
Polling failures replace the UI with ERROR rather than silently retaining live
badges. Source timestamps are API retrieval times, not guaranteed trade times.
Missing volume/change/transaction counts remain null rather than fabricated zero.

## Retention and activity
One current Radar snapshot per agent; at most 500 persisted snapshots per agent,
retained for at most 30 days. Cleanup occurs on capture/read. Historical trade
ledger and position close records remain intact for PnL; they are not raw polls.
Only the latest 200 transient SIGNAL_DETECTED/SIGNAL_SKIPPED/RISK_REJECTED history
rows per agent remain. New unchanged scans/rejections do not create history rows.
Global activity omits duplicate signal/position stages around trades and suppresses
same-reason skip/reject repetitions within five minutes. Detail ledger is separate
from that curated projection; financial metrics still use the complete trade ledger.

Trading Desk and optional phone consume the same network.activity source. The
phone remains removed from Overview per the earlier user request; this feature
does not restore it or add any production fixture data. UI fixtures live in tests.

## Alternatives
Rejected frontend signal/risk recomputation, invented opportunity lists, AI scores,
and a second execution engine. Rejected logging every raw poll forever. Rejected
pruning the financial ledger to achieve snapshot retention, which would corrupt
trade counts and historical PnL. Legacy activity is not backfilled with guessed
market snapshots; the Decision Log starts with newly observed decisions.

## Consequences
Radar is a single-market monitor, not a market-wide scanner. Execution/PnL are
simulated. Indicative Mainnet data is not an executable DEX quote. Live remains
locked; Pump.fun, metadata, initial buy, custody, wallet approval, VPS and the live
DEX executor are untouched. No hidden model reasoning is stored or displayed.

## Verification
29 targeted tests passed across market-radar, strategy-config, paper-trading,
paper-engine-expansion, trading-projection and trading-network. Coverage includes
actual engine snapshots, config versions, signal failure/success, early risk
rejection and not-evaluated checks, stale/missing/error data, pause during a market
read, ownership, bounded retention and preserving trade ledger, curated global
events, and the Desk/optional phone using the same source. Vite build passes
with the existing lazy phone chunk size warning.

Rendered the production component in a clearly labeled isolated fixture at
1440x960 and 390x844. Verified filters, expanded details, offline/paused/stale/error
states, readable checks and no core horizontal overflow; no browser console errors.
Fixtures use synthetic inputs evaluated by the real Paper engine, never injected
into production data. No real agent was started or traded for browser QA. The
local API was restarted after verifying zero WORKING Paper agents.
