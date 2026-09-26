# 021 — One Paper network projection, custody remains locked

## Status
Accepted. 2026-09-27.

## Decision
Extend existing `paper_states` / `paper_history`, not a second trading system.
Paper does not require a launched token or an agent signing wallet. The owner
configures a Mainnet market mint explicitly (a confirmed launch mint is a default,
not a prerequisite). Strategy/risk and indicative execution remain deterministic.
Restart pauses started agents. Funding and Live remain disabled; incomplete DEX
adapters return NOT_IMPLEMENTED. No LLM has access to keys or execution authority.

Canonical status: DRAFT (no valid market configuration), READY (configured, never
started), WORKING (enabled), PAUSED (previously started, disabled). Launch status
is separate and existing receipts are unchanged.

Canonical events reside in paper_history with eventId, agentId, timestamp,
mode='paper', type, tokenMint/tokenSymbol, strategy, requestedSizeSol,
executedSizeSol, entryPrice/exitPrice (USD), pnlSol/pnlPercent, positionId,
confidence (null when absent), reason, marketSnapshotId. Old history is projected
without inventing missing fields or counting partial sells as closed wins.

## Shared API contract
- GET /api/trading/network: {mode:'paper', liveLocked:true, agents:[projection],
  overview:{activeTraders,openPositions,tradesToday,totalPaperPnlSol}, activity:[]}
- GET /api/trading/activity: {mode:'paper',events:[]}
- GET /api/trading/leaderboard?sort=pnl|roi|winRate|trades:
  {mode:'paper',liveLocked:true,agents:[projection with rank]}
- GET /api/trading/payroll: authenticated owner's {mode:'paper',agents:[]} with
  WORKING/PAUSED only.
- GET /api/trading/agents/:id: public read-only projection (no wallet/owner/secret).
- Existing GET /api/agents/:id/trading: owner-only projection plus old compatible
  fields, wallet public info, limits, profiles, tokenLive and locked controls.
- POST /api/agents/:id/trading/configure: {strategy,tokenMint}; only while paused.
- Existing POST enable {mode:'paper',strategy}, pause {}, wallet {}, balance {}.
  No paper deposit required; starting capital uses server LIMITS.paperCapitalSol.
- GET /api/agents/:id/positions: {mode:'paper',positions:[]}, owner-only.
- GET /api/agents/:id/activity: {mode:'paper',events:[]}, owner-only.

Projection fields: agentId, name, character, tokenName, tokenSymbol, tokenMint,
mode, status, strategy, paperStartingCapitalSol, paperCashSol, portfolioValueSol,
realizedPnlSol, unrealizedPnlSol, totalPnlSol, roiPercent, tradeCount, wins, losses,
closedPositionCount, winRate, openPositions, lastAction, lastUpdated, activity.
Position fields: positionId, tokenMint, tokenSymbol, quantity, entryPriceUsd,
currentPriceUsd, sizeSol, marketValueSol, pnlSol, pnlPercent, openedAt.
Unavailable values are null, never fabricated zero. Shared projection computes
metrics once; pages only format them. Paper execution will retain native SOL cash,
cost and realized accounting alongside legacy USD fields; legacy SOL metrics that
cannot be reconstructed reliably remain null. Wins/losses use full closed positions.

## Ownership during implementation
Lead: server/agent-trading.js, server/app.js integration, workspace.js routing,
shared docs and API integration tests. Engine agent: paper-engine.js, market-data.js,
engine tests. UI agent: trading-ui.js, new trading-pages.js and trading CSS/tests.
Projection/lock agent: trading-projection.js, live-execution.js/interfaces and tests.

## Visibility and safety
Network exposes only sanitized agent presentation and Paper performance, no owner
or custody fields. Payroll/commands remain owner-scoped. Public cards link to a
read-only trader detail; private Agent Detail retains owner-only launch controls.
Live and Paper tables/events never mix. Poll at 15 seconds only while visible;
market requests are cached/coalesced. No generated demonstration activity.
