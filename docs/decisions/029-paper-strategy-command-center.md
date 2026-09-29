# 029 — Per-agent Paper Strategy Command Center

## Status
Accepted, 2026-09-27.

## Context
The existing deterministic Paper engine used three presets and global hard limits.
Agent Detail had two independent dropdown controls. Custom settings need server
validation, owner isolation and reproducible decisions, without enabling Live.

## Decision
Share the pure `public/app/strategy-config.js` schema/defaults between browser and
server. Keep Strategy → TradeIntent → Risk → Paper execution; risk independently
reads validated saved settings, never trusts thresholds supplied on an intent.
Keep existing hard ceilings (0.001 SOL/trade, 0.02 SOL daily turnover, 100 bps,
minimum 60s cooldown, one market/position). UI shows raw limits, not invented risk
ratings or confidence. Slippage/cooldown live in the execution group.

Owner-authenticated GET `/api/agents/:id/trading/strategy-config` returns
`{agentId,config,version,updatedAt}`. POST accepts `{config,version}`: strict finite
numeric/range/unknown-field validation, 400 invalid input, 409 stale version or
in-flight decision. Saved state, agent preset and STRATEGY_CHANGED are one SQLite
transaction. Equal saves are no-ops. GET after POST verifies persisted state.
Legacy agents derive their actual preset defaults until their first edit.

While WORKING, saves change new entries only. Entry positions retain configuration
and version through exits; legacy positions capture old settings before edits.
Current pause and global kill switch still apply. No implicit liquidation.
New decisions include configuration/version, structured filter flags and risk
results. Existing lifecycle and public projection feed the activity system; only
persisted meaningful saves produce strategy-change events, not UI adjustments.

## Alternatives
Rejected a second strategy store/engine, arbitrary LOW/HIGH classifications, and
multi-position/confidence controls unsupported by the present engine. Rejected
changing open-position stops on every save because that silently changes risk.

## Consequences
Stop/take-profit evaluate on ticks, not guaranteed prices, and remain subject to
cooldown/liquidity/daily risk checks. Daily turnover counts buys, sells and fees.
Position percent uses starting Paper capital; the existing 0.005 SOL hard ceiling
also remains. One market and one position are explicit constraints. Fixed preset
buy:sell ratios, upper momentum bounds and 15-minute holding limit stay visible
in the deterministic summary, not newly adjustable. No custody, funding, launch,
DEX execution or broadcast changes. Live remains locked.

The UI preserves draft edits during refresh, warns on navigation, and reuses
existing configure/start/pause/resume endpoints. Tests use temporary SQLite and
fake market quotes; the browser fixture is labeled and never invokes a wallet.

## Verification
`node --test tests/strategy-config.test.mjs tests/paper-trading.test.mjs tests/paper-engine-expansion.test.mjs tests/trading-projection.test.mjs tests/trading-network.test.mjs`: 24 passed.
`npm run build`: passed; existing lazy phone chunk size warning remains.
Rendered the real Command Center component through the isolated fixture at
1440x960 and 390x844. Verified presets, custom/save feedback, bounds errors,
reset confirmation, navigation cancel, WORKING saves, start/pause/resume and
mobile input bounds. This is component QA, not an authenticated production-agent
browser test. Backend owner isolation and persistence were tested using temporary
SQLite; no real agent strategy, wallet or transaction was changed for QA.
