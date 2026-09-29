# 031 — Bounded shared discovery for Paper agents

## Status
Accepted, 2026-09-27. Supersedes the single-market scope of ADR-030 for
agents explicitly started with discovery enabled. Legacy manual mode remains.

## Context
The existing Dexscreener adapter looked up pairs for one supplied mint. Official
API documentation exposes latest token profiles, not an exhaustive Solana token
universe. Profiles are discovery seeds, not evidence of trending, recent launch,
or investment quality. https://docs.dexscreener.com/api/reference

## Decision
Use `/token-profiles/latest/v1`, filter Solana and canonical PublicKey strings,
deduplicate provider-ordered seeds and keep at most 24. Retrieve existing
`/token-pairs/v1/solana/{mint}` quotes. Preserve venue selection (pumpfun,
pumpswap, raydium, orca) and choose the most liquid supported base-token pair.
Only expose latest-profile coverage, not market-wide/trending claims.

One process-level discovery service and market adapter are shared by agents.
Discovery refresh: 120s; snapshot cache: 15s; snapshot concurrency: 3. Discovery
responses inspect at most 500 records; quote cache: 128 tokens, 200 pairs/token;
transport budget: 120 quote requests/minute, 10s timeout, 60s cooldown on 429.
Discovery errors retry at the next 120s discovery boundary. No stale fallback is
represented as fresh. Observation timestamps are API retrieval, not trade time.

MarketCandidate: mint, quote (existing real market facts), error. Eligibility
requires valid mint, network solana:101, positive pricing/SOL price/liquidity,
finite nonnegative volume/buy/sell counts, finite momentum, age <=30s and <=1s
future tolerance, then the current config's liquidity/volume floors. Missing
values stay unknown. Rejections retain mint and explicit reason, bounded to 24.

Ordering: eligible first, actual entry-filter pass count descending, liquidity
descending, mint lexicographic tie break. This is deterministic prioritization,
not an AI score or expected-return ranking. Opportunity cards retain whitelisted
market facts, actual config/version, entry checks, queue state and decision.
Queue max 8; max 3 active strategy/execution evaluations per tick including the
held position. Entry checks for ordering can inspect all 24; only selected fresh
eligible candidates create intents. Unknown/stale candidates do not create one.

The existing strategyIntent and executePaper/risk checks are called unchanged.
Held positions are managed first, even outside the latest discovery set; other
candidates wait for capacity without intent/risk execution. Held mint valuation
is never overwritten by another candidate. A missing held quote sets its current
market unavailable. Position exit config remains its entry version; new candidate
evaluations use latest saved config. Pause/revision is rechecked after all I/O.
Scanning continues despite full position capacity. No multi-position engine.

## API and UI
POST `/api/agents/:id/trading/enable` accepts `discovery:true` alongside existing
`mode:paper` and saved strategy. This explicit start/resume needs no selected
mint; a real SOL quote initializes existing simulated capital. Legacy manual
configure disables discovery; switching configuration requires Pause. Existing
open-position market-switch protection stays. Owner authorization is unchanged.

GET Radar is passive, with counts, <=8 opportunities, <=24 rejection reasons,
current config version and coverage. It never triggers scanning. UI filters
All/Watching/Passed/Skipped display server checks; Passed means entry filters,
not guaranteed risk approval or a buy. Provider unavailable/rate limited/stale
states remain separate from no eligible markets. Paused/offline shows historical
cards, not live recommendations. No automatic start on page load.

Only evaluated material transitions and trades enter Decision Log, deduplicated
by bounded per-mint fingerprints rather than alternating a global fingerprint.
ADR-030 retention (500/30 days and 200 transient activity rows) remains; trade
ledger/PnL are preserved. Discovery/capacity cards are transient, not feed spam.
Trading Desk and optional phone still share curated existing activity.

## Alternatives
Rejected arbitrary search terms/boost-based fake trending, whole-chain scans,
per-agent independent fetch loops, frontend strategy evaluation, invented scores,
and changing the one-position engine. No new data provider credentials required.

## Consequences
Coverage is narrow and provider-biased: latest profiled Solana tokens with
supported liquid base-token pairs. Not all tokens, new launches, or DEX markets.
No holder/mint-authority/rug analysis is claimed. Indicative Paper prices are
not executable DEX quotes. No Live execution, signing, funding or launch changes.

## Verification
37 targeted discovery and existing Paper/strategy/radar/projection/network tests
pass. Production build passes (existing lazy phone chunk warning). Isolated
rendered component QA passes at 1440 and 390, including opportunity filters,
rate-limit state, no horizontal overflow and no browser console errors. Fixtures
are explicitly synthetic and live under tests, never seeded into real agents.
Read-only provider smoke observed 24 discovered mints: 12 with supported liquid
pair quotes, 12 MARKET_UNAVAILABLE. This is a point-in-time sample, not promised
coverage. No actual agent was started for QA; no real funds or wallet requests.
