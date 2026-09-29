# Provable route discovery — 2026-09-27

## Outcome

NOT_READY. Four build requests exhausted the announced bound; no more sampling.
No selected/approved route, production adapter, positive SUPPORTED fixture or funding recommendation.
Deriverse remains REJECTED_UNPROVEN_CPI; existing decoder retained.

## Controls and methodology

Current [Jupiter V2 build documentation](https://developers.jup.ag/docs/api-reference/swap/build) documents mutually exclusive case-sensitive `dexes`/`excludeDexes` and `maxAccounts` (1–64). It does not document `onlyDirectRoutes` or `restrictIntermediateTokens`. A DEX filter/account limit does not guarantee one hop.
Verified labels using the official program-id-to-label endpoint; sanitized label snapshot is in tests/fixtures/discovery-provider-labels.json.

Exactly four unsigned build calls, `maxAccounts=32`, slippage 100 bps: hypothetical BUY 100000 lamports SOL→USDC and SELL 10000 base units USDC→SOL, each for Raydium CP and Whirlpool. No transaction was signed, simulated or submitted. No custody wallet operation was created.
Legacy and v0 diagnostic messages were locally compiled with the existing diagnostic 1.4m CU limit, NOT an approved execution policy. Provider route instructions were not rewritten.

## Scorecard

| Sample | Result/hops | Writable | Provider ALT / legacy ALT | Classification |
|---|---|---:|---:|---|
| Raydium CP BUY | HTTP 400; no captured route | N/A | N/A | UNPROVEN |
| Raydium CP SELL | HTTP 400; no captured route | N/A | N/A | UNPROVEN |
| Whirlpool BUY | HTTP 200; SOL→USDT→USDC, 2 hops | 18 | 2 / 0 | PARTIAL |
| Whirlpool SELL | HTTP 200; USDC→SOL, 1 hop | 9 | 1 / 0 | PARTIAL |

HTTP 400 is not proof that Raydium CP can never serve this pair: the wrapper did not retain the error body. No retry or guessed explanation.
Whirlpool BUY observed slot 450940714, SELL 450940716. Both legacy and v0 compiled/resolved, but remain UNAUDITED_JUPITER_CPI_ROUTE.
BUY legacy message hash: 212c42fb538bad2b2c5a894bdc2edd529e69a809fe5a001a8b7ac1c6eebf7bf6.
SELL legacy message hash: 1ab9dad5fd52bde611268b28f31efde92618773629ef26d40baa10cf36c6ead1.

## Proof boundary

Programs observed: System, ComputeBudget, classic SPL Token, Associated Token, Jupiter JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4, Whirlpool whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc.
Official downstream source/IDL exists (see provider/value evidence documents). This does not prove deployed Jupiter CPI construction, remaining-account mapping or forwarded minimum-output semantics. Source-to-deployed binary binding is not established.

BUY has 15 downstream/shared writable accounts without complete approved role/value-effect proof, beyond Agent wallet and two derived Agent ATAs. SELL has 6 downstream writable accounts without complete proof, beyond the same three accounts. RPC ownership/token mint observations are not a substitute for those roles. Zero-unexplained-writable gate fails.

BUY: create derived WSOL and USDC ATAs; wrap 100000 lamports, SyncNative, unproven shared two-pool route, close WSOL to Agent. Intermediate USDT/shared custody flow unproven.
SELL: derived USDC source absent (INPUT_TOKEN_ACCOUNT_MISSING); create derived WSOL ATA, unproven direct route, close WSOL to Agent. Output receipt cannot be proven through CPI.
ALT: current RPC owner/index resolution succeeds; legacy alternatives require no ALT. This does not establish route semantics.
ATA: both canonical Agent ATAs absent at observation; BUY creation structure visible. SELL has no actual input balance/account.
WSOL: wrap/sync/close outer instructions visible, close destination Agent; complete route value flow remains unproven.
Minimum output: BUY provider threshold 12337; SELL 79462. These are provider claims, not independently established router enforcement/rounding.

## Deliverables / gates

Selected candidate: NONE. Raydium CP was simplest research preference but produced no build; Whirlpool failed complete BUY/SELL proof.
Positive real fixture: NONE approved. The successful samples are observations only, not a reusable positive production corpus.
New positive-route mutation suite: NOT APPLICABLE / NOT CLAIMED; cannot manufacture a passing positive. Existing adversarial validators remain unchanged.
Production adapter: not wired, UNVERIFIED_ROUTE_ADAPTER. No allowlist broadened.
Current Agent balance independently RPC-checked: 0.004995 SOL. Owner: 0.107067872 SOL.
Minimum required balance: UNKNOWN. Additional SOL required: UNKNOWN. Capital model deferred until exact BUY/SELL proof; no deposit suggested.

## Safety verification

Tests: full run 312/313 PASS, one market-radar loop `fetch failed`; isolated rerun 5/5 PASS without code changes. DEX subset 134/134 PASS including four new documented-control tests. Do not describe the first full run as entirely green. Build PASS (existing chunk-size warning). Logs: artifacts/ui/provable-route-tests.log, provable-route-radar-rerun.log, provable-route-dex-tests.log, provable-route-build.log.

Health OK. Funding, Withdrawal, Controlled Real and Live Trading false; global kill switch true. Health's legacy network=devnet/broadcastEnabled=true are separate legacy fields, not DEX authorization; DEX adapter remains unverified.
Seven existing wallet records, all terminal; ledger SHA256 unchanged: 9cacd17c08353de3d5949aafd10e05e841eca242c3832d9c6776b793d3c232f1.
No runtime restart necessary: only discovery helper/offline tests/docs changed. Frozen subsystems and UI untouched.

Remaining blockers: independently verifiable deployed Jupiter CPI mapping and amount/threshold enforcement; complete downstream/shared account value-role proof; one jointly provable BUY/SELL family; positive fixture and full mutation acceptance; then disabled adapter and route-specific capital model.
