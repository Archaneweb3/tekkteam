# Launch strategy system research

Date: 2026-09-30. Status: research and proposed design only; no runtime implementation or activation.

## Executive finding

**CURRENT:** TEKKTEAM supports three validated profile IDs: `selective`, `balanced`, `momentum`. They are three parameter presets over **one deterministic momentum/activity-filter algorithm**, not three independent strategy implementations. There is already bounded custom parameter editing for that algorithm. An additional legacy strategy/custom UI exists in source, but is not the active application bootstrap and must not inflate the supported strategy count.

**RECOMMENDATION:** distinguish behavior archetype, parameter preset, risk limits, execution-mode support and execution authorization. Start a versioned Strategy Registry with the existing behavior and its three profiles. Add genuinely different archetypes only after their data, decision logic, testing and execution-mode qualification exist. Do not ship ten names over one engine.

This report follows the documentation-and-adrs evidence discipline: CURRENT facts and TARGET proposals are separate. It is not an accepted implementation ADR. Foundation documents and transaction/security boundaries are unchanged.

## Scope and evidence

Read local source, not production runtime. No service was started, database changed, wallet connected, launch submitted or transaction prepared/signed/broadcast. Current production feature flags were not queried; source support below is **not** a claim that Real trading is enabled.

Primary local evidence:

- `index.html` → `src/bootstrap.js` → `public/app/workspace.js`: active application; bootstrap inserts `/app/workspace.js`, not `/app/main.js`.
- `server/config.js`: public catalog, profile IDs/descriptions and legacy exposure metadata.
- `public/app/strategy-config.js`: shared defaults, strict validation, configurable fields and deterministic summary.
- `server/paper-engine.js`: `strategyIntent`, `determineIntent`, `riskCheck`, `executePaper`.
- `server/agent-trading.js`, `server/opportunity-scanner.js`, `server/market-discovery.js`: saved state, tick/scan and candidate paths.
- `public/app/strategy-center.js`, `public/app/agent-detail-tabs.js`, `public/app/workspace.js`: creation profiles and owner operating UI.
- `server/dex/autonomous-orchestrator.js`: shared entry evaluator and distinct Real exit orchestration.
- `server/dex/autonomous-v1.js`: independent Real policy, venue qualification, sizing ceiling and quote-based exit decisions.
- `server/dex/autonomous-acceptance-worker.js`: narrowly authorized acceptance worker, not general strategy availability.
- `public/shared/custom-strategy.js` is imported by legacy `public/app/main.js`; it is not evidence that its five legacy bases run in the active workspace.
- `docs/decisions/029-paper-strategy-command-center.md`: saved configuration/version, hard ceilings and position snapshots. Current code takes precedence where the older ADR wording differs.
- `docs/PRD.md`, `SYSTEM.md`, `ARCHITECTURE.md`, `DESIGN.md`, decision 082 and `LAUNCHPAD-COMPETITIVE-RESEARCH.md`: launchpad-first foundation, separate lifecycles and privacy/authorization boundaries.

External primary evidence, inspected 2026-09-30:

- [BAGWORK Launch](https://bagworkagent.fun/#/launch): actual browser accessibility tree and full-page screenshot; no wallet approval or launch. Competitor presentation is evidence of a product pattern, not backend verification.
- [Freqtrade strategy customization](https://www.freqtrade.io/en/latest/strategy-customization/): separates historical candle/indicator preparation from entry/exit signals. This supports requiring data-history contracts before trend/breakout implementations; it does not establish TEKKTEAM support.
- [Hummingbot pure market making](https://hummingbot.org/strategies/v1-strategies/pure-market-making/): bid/ask quoting and order management are different from repeatedly taking AMM swaps. This informs excluding market-making claims from the present execution architecture.

## 1. Current supported profiles

Names/descriptions below are the actual catalog, not proposed marketing labels. Entry parameters are the **default saved configuration**; custom configuration can alter the allowed subset.

| Field | Selective | Balanced | Momentum |
| --- | --- | --- | --- |
| ID | `selective` | `balanced` | `momentum` |
| Catalog name | Selective | Balanced | Momentum |
| Catalog description | Prioritize fewer opportunities and smaller exposure. | A measured profile with conservative position limits. | Follow established movement with a defined risk budget. |
| Behavior | Shared positive-momentum/activity filter | Same | Same |
| 5m price-change entry band | 0.5–5% | 0.75–10% | 1–20% |
| Minimum buy:sell count ratio | 1.5 | 1.25 | 1.1 |
| Minimum 5m USD volume | $1,000 | $750 | $500 |
| Minimum USD liquidity | $25,000 | $15,000 | $10,000 |
| Take-profit trigger | +5% | +6% | +8% |
| Stop-loss trigger | −3% | −3.5% | −4% |
| Maximum hold | 15 minutes | 15 minutes | 15 minutes |
| Default Paper maximum trade | 0.001 SOL | 0.001 SOL | 0.001 SOL |
| Default position cap | 10% of starting Paper capital | Same | Same |
| Default daily turnover incl. fees | 0.02 SOL | Same | Same |
| Open-position limit | One | One | One |
| Default cooldown / slippage ceiling | 60 seconds / 100 bps | Same | Same |
| Paper support | Implemented | Implemented | Implemented |
| Real source support | Shared entry logic reusable in separately gated narrow CPMM autonomous port; not a general enabled product | Same | Same |
| Backend | `PROFILES` + shared `strategyIntent`/Risk; shared Real entry evaluator | Same functions | Same functions |
| UI | Creation and Strategy Center: Conservative / Low risk label | Balanced / Moderate label | Aggressive / High label |

### Shared entry, exits and stop behavior

Entry requires **all** configured liquidity, volume and price-band checks plus the profile buy:sell count ratio. The sell-count denominator is floored at one. When a position exists, the engine evaluates that position instead of proposing another entry. This is deterministic rule evaluation; no model-generated discretionary signal or profitability confidence was found in this path.

Paper exits are TP, SL or 15-minute hold triggers. They still pass Risk; a trigger is not a guaranteed fill. The engine caps a simulated SELL by configured maximum trade size, so partial sells can occur. Real orchestration instead checks actual token quantity against the stored position and requests a full-position SELL, valued using a fresh executable pool quote. Both retain entry-time strategy configuration for exit consistency. Do not advertise identical Paper/Real fills or a guaranteed liquidation deadline.

Paper independent Risk checks: correct enabled Paper mode, kill switch, valid saved configuration, matching token/network, fresh positive market data, trade/capital/position caps, valid accounting, daily turnover including buy/sell fees, liquidity/impact/slippage checks and cash/exit-fee sufficiency. Cooldown currently blocks BUY, not protective SELL. Pause/kill switch prevents operation; it is not an implicit liquidation instruction. The time limit triggers an exit attempt, subject to checks and tick availability.

Paper defaults to 0.1 SOL simulated starting capital. Configured per-trade size is a cap checked against position budget, not a promise to automatically resize to every available budget. A too-large request may be rejected. Shared hard ceilings include 0.001 SOL/trade, 0.005 SOL/position, 10% starting capital, one position and 0.02 SOL daily turnover. Simulated fees are distinct from actual Mainnet fees.

Real has a separate envelope: Mainnet identity, owner/Agent/vault binding, verified supported Raydium CPMM/WSOL-token pool provenance, fresh chain/quote state, independent Risk, reserve/rent/fees, validator, exact simulation, signing/broadcast claims and reconciliation. `AUTONOMOUS_V1` limits BUY to at most 100,000 lamports, one position, 100 bps slippage and 500,000 lamports daily turnover; its failure circuit opens at three consecutive failures. The policy enforces signal age ≤30 seconds and executable price quote age ≤10 seconds. These are not the Paper settings or proof of current production authorization. Controlled Real is separately owner-directed exact-intent review/confirm, not another automated strategy algorithm. Pump.fun token launch is not the supported swap venue; token creation does not prove its market is executable.

### Proven implementation-depth issues

1. `server/config.js` advertises `maxPositionPct` 5 / 10 / 15 for Selective / Balanced / Momentum. The active validated config defaults to 10% for **all three** and caps it at 10%. The advertised 15% is not an executable permission. These competing sources must be rationalized, not used to justify raising limits.
2. UI presents low/moderate/high risk labels and conservative/aggressive names, while backend IDs mix a risk profile with the name of a behavior. Those labels are qualitative filtering descriptions, not calculated loss probabilities.
3. All three share the same sizing/position/cooldown defaults; the catalog claim of smaller exposure for Selective is not backed by a smaller default size in the active config.
4. Custom currently means bounded parameter edits, not a new archetype. Editable: minimum liquidity, volume, momentum; trade/position/daily limits; slippage/cooldown; TP/SL. Profile upper momentum bound, activity ratio, one-position ceiling and 15-minute hold are not custom controls.
5. Legacy `main.js`/`custom-strategy.js` contains a larger alternate vocabulary and sliders. Active bootstrap does not load it. Do not expose these as available backend strategies.
6. A successful token launch must not imply trading one's own coin, token-support buying, fee reinvestment or activation of any Real mode. Those would be distinct product/permission policies.

## 2. BAGWORK Launch product pattern

**Observed options:** six preset radio options plus one custom-builder action. Not seven independently verified algorithms. Visually a prominent default card followed by compact paired choices, with a separately highlighted extreme-risk fresh-pair option and custom action. There is no formal risk/archetype grouping navigation.

Each preset shows name, short behavior tagline, trade-size fraction, profit trigger, loss trigger and holding horizon. Selected strategy has an additional plain-language behavior explanation. The side preview repeats the selected plan with sizing, exits, trailing-stop state and holding limit alongside capital/cost information. This makes consequences more legible than names alone, although entry details are less prominent than exit parameters.

Risk is communicated through numeric exposure/exits, the extreme-risk option warning and a general possible-total-loss disclosure. It is not evidence of a calculated risk score or a guaranteed stop price.

**Classification:** visible choices combine archetype-like labels with parameter bundles. The custom option advertises sliders and a user-defined name. Clicking it in the unauthenticated browser opened Connect Wallet; the custom editor and its limits were **not independently inspected in this task**. Therefore fully custom logic, specific custom controls and backend enforcement remain unverified. No wallet selection followed. Existing local legacy code is not proof of the live competitor editor.

User control observed without wallet: preset selection, identity/metadata and starting-capital input. The page says strategy can later be changed by the creator. Custom depth and authorization semantics are not verified. The funnel places strategy after coin/Agent identity and capital, before submission, with a concurrent review and explanation of subsequent steps.

Portable lesson: **choose a behavior, see its concrete operating plan, understand costs and failure/stop conditions, then review the consequence.** Do not copy its six-option catalog, branding, UI grid, parameter values, launch funding model or claimed automatic activation. TEKKTEAM's payer and execution authorization remain its own.

## 3. Proposed Strategy Registry (TARGET)

Separate four concepts:

`StrategyDefinition + PresetConfiguration → validated AgentStrategyRevision → proposals → independent Risk → independently authorized execution`

The registry produces configuration and read-only descriptions, never funding/start/signing permission. A launch event never consumes this registry as an execution command.

| Conceptual field | Required meaning |
| --- | --- |
| `id`, `version`, `name`, `shortDescription` | Stable behavior identity and immutable revision; names are not authorization |
| `behavior/archetype` | Algorithm family and plain-language job |
| `riskTier` | Qualitative classification with rationale; relative within memecoin context, never “safe” |
| `entryRules`, `exitRules` | Typed, deterministic supported predicates and explainable reason IDs |
| `positionSizing` | SOL/raw-unit cap, percentage basis, fee/rent reserve and rounding; explicit rejection behavior |
| `maxExposure` | Per-position, aggregate, daily turnover and position-count caps |
| `takeProfitLogic`, `stopLossLogic` | Trigger, valuation basis, full/partial exit policy; not guaranteed prices |
| `cooldown`, `timeHorizon` | Units, clock source, max hold; protective-exit semantics explicit |
| `marketConditions` | Required data coverage, mint/pool/venue eligibility, liquidity/activity bounds and freshness |
| `supportedExecutionModes` | PAPER / CONTROLLED_REAL / AUTONOMOUS_REAL; qualify each separately |
| `implementationStatus` | AVAILABLE / EXPERIMENTAL / PLANNED, with evidence and per-mode status |
| `configSchema`, `presets`, `parameterBounds` | Server-owned permitted fields, defaults, constraints and compatibility |
| `implementationRef`, `requiredData`, `qualificationEvidence` | Evaluator/version, history/indicator requirements and tests |
| `stopConditions` | User pause, safety stop, stale/unsupported data, budget/circuit/unresolved outcomes; distinguish pause from liquidation |

Do not flatten AVAILABLE into “Real enabled.” A mode needs separate implemented/qualified/operationally-available/owner-authorized checks. Existing `LIVE_AUTONOMOUS` can remain the internal mode name, mapped explicitly to registry `AUTONOMOUS_REAL`; do not rewrite historic records.

Persist immutable strategy/config version and hash on decisions and entry positions; preserve exit-policy snapshots. Record permitted changes atomically with owner binding and optimistic version checks. No mid-position change to reviewed stop/sizing silently alters the position. Registry migrations preserve legacy IDs and histories; explicit adapters map old profile IDs into one archetype plus preset ID.

## 4. Archetype evaluation and honest rollout

These are product/engineering suitability judgments, not investment recommendations or return claims.

| Archetype | Fit and actual additional requirements | Recommendation |
| --- | --- | --- |
| Momentum | Existing positive 5m movement + activity/liquidity evaluator; narrow supported execution venues only | First registry behavior; existing Paper implementation, Real qualification separate |
| Trend following | Needs persistent ordered time series, defined lookbacks/indicators/warmup and trend-failure exits; one 5m change is not trend confirmation | Next research/Paper prototype, PLANNED until implemented |
| Breakout | Needs rolling range/high/low, confirmation, volume baseline, false-breakout exit and history coverage | Later PLANNED; not another momentum threshold |
| Dip/recovery | Needs earlier decline plus stabilization/recovery sequence and liquidity safeguards; negative momentum alone is not an entry thesis | Candidate second distinct behavior, Paper-first PLANNED |
| DCA | Scheduled tranches, remaining budget, cost basis/additional-entry state, cancellation and token eligibility; conflicts with current no-add-entry behavior | Post-MVP for explicitly selected sufficiently established markets; not default fresh-coin automation |
| Scalping | Requires fee-aware net-edge, turnover/latency/RPC budget and executable liquidity qualification | Defer; short hold does not make current implementation a qualified scalper |
| Swing | Longer history/regime, persistent monitoring/restart recovery and longer exposure policy | Post-MVP; not just extending max hold |
| Volume/activity | Already entry filters; distinct strategy requires baseline-relative activity, anomaly/manipulation checks and an independent exit thesis | Keep as filters now, not a fake extra preset |
| Market-making-like | AMM swap taker path does not provide resting bid/ask order management or LP inventory accounting | Exclude current roadmap claims; separate architecture/product if ever pursued |
| Custom | Existing bounded configuration over verified evaluator; arbitrary scripts/prompts unsupported | Offer constrained configuration, not arbitrary-code execution |

Recommend current quick presets as **one behavior with Strict / Standard / Broad filtering profiles**, retaining legacy IDs internally. Names are tentative TEKKTEAM-owned labels; do not change implementation now. Show identical default sizing truthfully. Strict filtering does not guarantee lower loss. Trend confirmation and Recovery may become additional quick-start behaviors only after true implementations and Paper qualification; until then list in roadmap, not selectable launch options.

A platform-launched Pump.fun token may have no supported executable CPMM market yet. Strategy must show WAITING FOR SUPPORTED MARKET, not fabricate a pool or bypass venue guards. Agent identity/token lifecycle and optional strategy market universe stay distinct. Whether an Agent may trade its associated token requires explicit future policy; no support-buy implication.

## 5. Preset + constrained custom model (TARGET)

Quick start picks a tested parameter bundle within an implemented archetype. Advanced changes the supported typed fields with bounds enforced server-side. Saving a custom configuration does not create a new algorithm, confidence score or Real authorization.

Advanced groups: Entry → Exit → Capital/Risk → Cooldown/Limits. Reuse existing bounded schema first. Do not show unsupported trailing stop, indicator, DCA or multi-position controls. Future predicates require explicit type/unit/data/freshness contracts and deterministic evaluation; reject arbitrary code, browser-supplied evaluator functions, execution calls and unrestricted model-generated rules.

Every edit updates one operating-plan summary; distinguish default, customized and unsaved state. Display configured versus effective limits per mode, with the binding ceiling and reason. Stop-loss means trigger, not guaranteed fill price. Fees can outweigh small expected price changes. Preview is explanatory, not a profitability forecast.

## 6. Launch selection UX (TARGET; not a mockup implementation)

Within CREATE, place an optional operating-plan step after identity and before final review. Token setup/launch may remain optional; selecting a strategy is not required to make an identity valid.

1. **Behavior:** show only actually available archetypes, with one sentence explaining the job. Initially one momentum behavior plus its three filtering profiles; do not pretend three archetypes exist.
2. **Plan:** five short answers: what it observes; when it proposes BUY; when it proposes SELL; maximum capital at risk/exposure; when entries pause and exits may be attempted.
3. **Capital:** separately display trading allocation, per-trade/total caps, daily turnover, protected reserve and independently sourced fees/rent. Launch initial buy is not operating capital or strategy entry.
4. **Advanced:** collapsed existing supported controls; clear units and bounds, no dense wall of cards.
5. **Review:** behavior/profile/config revision, Paper/Real support status, entry/exit summary, effective limits, source/freshness and unavailable costs. Saving plan or launching token does not start trading. Default post-creation operation remains paused until its own legitimate owner action.

Desktop uses the established Home/Launchpad panel language with a focused editor and compact plan summary, not another terminal or copied competitor grid. Mobile uses the same ordered steps in one column, readable labels and large targets; advanced settings disclose instead of shrinking. Accessible radio/group controls, keyboard focus, understandable errors and retained drafts. Public visitors must not need wallet access to read generic strategy explanations; private configuration stays owner-only.

A possible selected-plan explanation: “Observe positive movement and buying activity in eligible liquid markets. Propose an entry only when every filter passes. Attempt exit at the configured profit/loss trigger or holding deadline. Reject entries outside budget, freshness or venue policy. Pause when authorization or safety checks fail.” Populate numeric limits from validated configuration, not hard-coded marketing copy.

## 7. Work required before implementation

**Backend:** unify catalog/defaults/schema into an authoritative versioned registry; migrate profile references without losing history; preserve existing evaluator and independent Risk/execution port; return effective per-mode support/limits and reasons; add registry/config/position compatibility fixtures. Investigate metadata/default exposure mismatch before choosing any policy change. New archetypes require ordered historic data, coverage/warmup/no-lookahead tests, deterministic decisions and independent per-mode qualification.

**Frontend:** consume registry instead of parallel catalog/labels; behavior-first plan + bounded preset/custom editor; honest same-algorithm wording; support/disabled reasons per mode; launch review integrates strategy without activation; retain shared TEKKTEAM components and mobile/accessibility behavior. Hide unused legacy choices rather than exposing nonexistent support.

**PRD changes required:** define archetype/profile/risk/mode vocabulary; identify current one-behavior scope; optional launch operating plan; explicit answers to buy/sell/risk/stop; distinguish associated coin from trading universe; qualification criteria for later behaviors; no default launch-to-autonomous activation. No promise of returns, support buys or creator-fee funding.

**Architecture changes required:** document StrategyDefinition → AgentStrategyRevision → proposal boundary, per-mode qualification, immutable entry-policy snapshots, safe legacy mappings and effective-policy projection. Registry must never contain or convey custody/sign/broadcast authorization. Future time-series pipeline is separate from fresh security-sensitive transaction-state acquisition.

**Acceptance checks for future implementation:** no catalog/default mismatch; only implemented choices selectable; unknown strategy/parameter rejected; same config resolves consistently browser/server; changes preserve open-position rules; Paper never enters Real port; registry save/launch cannot enable Funding, Withdrawal, Controlled Real or Autonomous; kill/emergency/network guards remain authoritative; unsupported/stale data rejects; public projection excludes private configuration and capabilities.

## Research completion

Implementation: **NONE**. Only this research document was added. No feature flags, application code, database, service, wallet, transaction or production deployment changed. No wallet interaction or launch action was performed. Runtime feature readiness is deliberately not certified by this source audit. The competitor's authenticated custom editor remains unverified and is not required to establish the visible preset/review product pattern.
