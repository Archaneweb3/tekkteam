# 033 — Canonical Paper performance read model

## Status
Accepted, 2026-09-27. Extends ADR-032; Paper strategy/risk/execution, discovery,
Radar and immutable Decision Log remain unchanged.

## Context
The authoritative persisted ledger is paper_history: raw execution receipts are
preserved alongside lifecycle events. No separate fill ledger exists. Financial
analytics must read those raw receipt fields, not the curated UI activity feed.
paper_states contains native SOL cash, realized PnL and position cost basis. No
portfolio history previously existed. Historical quote marks cannot be rebuilt
from current balances. Existing configure/enable/resume preserve capital; there
is no capital-reset API. Strategy changes are not new capital sessions.

## Decision
server/paper-analytics.js owns deterministic formulas. trading-projection calls
the same portfolioMetrics, closedPaperTrades and tradeStatistics functions; both
owner analytics and existing network/leaderboard/payroll therefore agree. No
analytics function executes a trade or fetches a market. Closed-trade ranking
and UI use closedPositionCount; compatibility tradeCount remains BUY/SELL fills.
Employee of the Month explicitly labels TOP PAPER ROI / TOP PAPER PNL and uses
the backend ranking with at least one closed position. Payroll uses these same
metrics and does not draw synthetic sparklines.

Native SOL formulas:
- portfolio = cash + sum(quantity * recorded priceUSD / recorded SOLUSD).
- unrealized = sum(marked value - remaining native SOL cost basis).
- realized = authoritative paper_states.realizedSol (includes partial exits).
- total = portfolio - starting capital; ROI = total / starting capital * 100.
- Missing native accounting stays null. Last recorded mark is labelled stale
  when older than 30 seconds; it is never stored as fresh curve data.

Closed trades group raw BUY/SELL/POSITION_CLOSED by positionId. A closing receipt
and its close event represent ONE trade. Partial sells/open positions do not
count as wins/losses. PnL uses the engine's full closedPositionPnlSol / persisted
close pnlSol, not the final partial fill PnL. Return = closed PnL / (entry SOL
notional + entry SOL fee). Exit price is quantity-weighted across sell receipts.
Duration uses original BUY and closure timestamps. Missing entry, fee, quantity,
config/version or timestamps remain null, never filled from today's strategy.
Win rate = positive closed outcomes / all closed positions (breakevens included),
null if there are no closes or any unknown outcome. Wins/losses and averages
describe known outcomes; unknownOutcomes is explicit. Average/largest losses are
negative. Contributors aggregate closed outcomes by mint, versions by entry
strategy/version; incomplete group PnL stays null.

Decision funnel uses retained, meaningful evaluated snapshots, not discovery
polls or UI events: evaluated requires an actual strategy result plus checks;
signals passed/risk rejected count entry BUY intents, not exit SELLs. Paper
entries count BUY outcomes. Its 500-snapshot/30-day window is explicit; lifetime
closed trades are separately labelled and are NOT the same-window conversion.

## Recording and API
New paper_portfolio_history is an isolated read-model table. A separate passive
worker samples committed Paper state once per minute but stores at most once per
five minutes per agent. It never resumes agents, revalues via RPC, or touches the
ledger. Stale/unknown open valuations produce null/gaps, not invented equity.
Keep at most 8,640 points and 30 days per agent; GET does not collect snapshots.
Foreign-key cascade cleans the cache when its agent is legitimately deleted.
No ledger row is compacted/deleted by analytics.

Epoch is a hash of the recorded capital initialization (startedAt, initial native
and USD capital/rate), excluding strategy version. Curve and drawdown query only
the current epoch; old epochs remain within the same bounded retention. No reset
semantics or reset endpoint are introduced. Closed-trade analytics remain clearly
lifetime. A future reset workflow must explicitly scope its ledger as well.

Drawdown is negative (value/recorded running peak - 1)*100; maximum is the most
negative value. At least two usable observations are required. Current drawdown
is null when the latest sample is unavailable. Retained-window drawdown is not
an unrecorded lifetime maximum. UI connects real samples with straight segments,
breaks missing/long intervals, and labels the recorded range. Only ALL is offered.

GET /api/agents/:id/analytics reuses existing auth+owned guard and no-store policy.
Returns summary, valuation age, portfolioHistory/historyCoverage, decisionFunnel,
contributors, strategyPerformance and closed tradeHistory. It never emits raw
custody, owner, session or secret fields. Failures remain errors, not zero metrics.

## Alternatives
Rejected UI-feed-derived PnL, duplicating leaderboard formulas, invented backfill,
frontend pseudo-random sparklines, indefinite tick storage, threshold changes and
resetting live user state for QA.

## Verification
Isolated real-engine fixtures cover wins, losses, partial exits, open exclusion,
native accounting, returns, drawdown/gaps, missing history, config attribution,
funnel, contributors, bounded storage/epochs, authentication/ownership and actual
Leaderboard/Payroll endpoints. Existing 47 core tests are retained unchanged.
Browser fixtures render production analytics components at 1440 and 390 with
populated, empty and error responses; fixtures never enter real agent storage.
