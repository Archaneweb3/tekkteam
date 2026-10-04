# TEKKTEAM system map

CURRENT 2026-10-02 owner-flow source/API review accepted: the isolated owner-auth
harness uses the real challenge verifier and zero seeded sessions. The previous
seeded preview intentionally rejected auth POSTs with403. Launchpad now reviews
identity fields before Save and journals the exact owner/key/input across same-tab
reloads; canonical acknowledgement survives failed refresh. Scoped replay exposes
`replayed: true` only after existing owner/key/fingerprint checks. Coin image review
and immutable saved-draft reload are integrated. Independent local tests do not
prove human Phantom signMessage or browser Save; those remain pending. See the
latest DELIVERY_PLAN ledger and artifacts/owner-flow-recovery/reconciliation.md.

CURRENT 2026-10-01 direct continuation: preferred public metadata origin is https://tekkteam.tech but serving/publisher linkage and write access are NOT VERIFIED; runtime PUBLIC_METADATA_ORIGIN is absent in the inspected .env. The explicit metadata publisher now shares its resolved root/origin with image verification, without deployment or implicit ambient-origin activation. See artifacts/launchpad-continuation/direct-delivery/metadata-origin-inspection.md and the latest DELIVERY_PLAN ledger for scoped applied/reviewed versus blocked work. Local guest wallet/Agents/Market states represent owner-unavailable data, not zero balances or zero Agents. No Real or funding activation.

Status: repository audit, 2026-09-30. **CURRENT** describes code and checked-in deployment configuration, not an independently inspected live VPS. **TARGET** marks the new product direction. This document is not an operations authorization.

## Accepted source baseline and outstanding work

2026-10-01 continuing brief reconciliation. APPLIED means source changes present, REVIEWED means independent local evidence, UNVERIFIED means no browser/extension/production proof. Later sections with dated historical audits retain their original scope; this reconciliation supersedes outdated implementation claims. No runtime operation is authorized by this document.

**CURRENT APPLIED/REVIEWED:** #/launch mounts launchpad-page.js, not the former chooser; #/tokens and subordinate detail use tokens-page.js and shared owner-bound launchpad-view-model.js. Home/ten-nav and bootstrap recovery are present. Dedicated /api/launchpad/agent-identities and /api/launchpad/agents/:id/enter atomically bind immutable scope; /contract adds owner-safe launchpadScope. ReadLaunchpadScope is injected authoritatively into the Paper controller. Associated Paper uses exact owner/Agent-bound confirmed Mainnet receipt mint, rejecting other coins at configure/start/tick; GENERAL requires trustworthy scope absence.152/152 independent local cases/build accepted with issues.

Original wallet restoration122/122 independently accepted; frontend backend.js is the provider adapter, not API server. Original three-provider chooser/menu/dock remain. Preview public-address connection is browser-memory-only and has no authentication/signing/balance/storage or session upgrade. Actual extensions/visual QA unverified. Runtime/preview sole writer retains process ownership; no restart/port/current uptime assertion comes from this docs task.

**CURRENT safety limitation:** Mainnet general Agent mutation guard still rejects Paper configure/enable403. Positive execution tests run disposable local backend/controller with mocked Mainnet quotes/receipts and direct Paper ticks; no production or chain verification. Live remains OFF; Paper enforcement does not prove Controlled/Autonomous Real scope enforcement. No persistent database migration/backfill was run.

**TARGET gaps:** public recent launches needs explicit owner publication store+allowlist API; full token setup/metadata review and submitted lifecycle contract; richer Tokens receipt/sourced market view; Guide copy; Agent/Wallet/Leaderboard gap-specific improvements only after targeted existing-source checks. Receipt/DOT repair stays independently blocked, consumed attempts intact. Docs are updated, not deployment evidence.


## Current implementation

```text
Browser (Vite-built SPA; owner wallet provider)
  ├─ same-origin /api/* ────────────────> Node API :4190
  │                                      ├─ owner auth/session
  │                                      ├─ Agent/Paper/Wallet/DEX domains
  │                                      ├─ SQLite + WAL in DATA_DIR
  │                                      ├─ encrypted Agent Wallet custody
  │                                      └─ dedicated Mainnet RPC
  └─ /api/pump-launch/* ────────────────> Launch service :4193
                                         ├─ Pump readiness/build/review
                                         ├─ receipt + Prepare-attempt journals
                                         ├─ public metadata publishing
                                         └─ dedicated Mainnet RPC / Pump.fun

Nginx/HTTPS (deployment plan) routes the two API paths and serves dist/.
PM2 (checked-in manifest) runs one API and one launch-service process.
```

- **Frontend:** `index.html` loads `src/bootstrap.js`, which mounts `public/app/workspace.js`. Hash routes include Home, Agents, Agent Detail, Tokens, Market, Trading, Wallet, Leaderboard, Payroll, Guide and a Launch chooser. Browser UI is not the authority for network, ownership, launch success or value movement.

### Route audit

| Route | CURRENT role | TARGET disposition |
| --- | --- | --- |
| `#/overview` | 3D office Home, metrics and Trading Desk | Keep; make launchpad-first after a separate redesign phase |
| `#/agents`, `#/agents/new`, `#/agent/:id` | Owner roster, combined Agent+token wizard, five-tab Agent Detail | Keep; decouple identity creation from optional token and elevate token lifecycle |
| `#/launch` | Chooses an existing Agent; Pump form opens from Agent Detail | Reposition as a real primary Launchpad destination, reusing existing transaction path |
| `#/tokens` | Owner inventory of configured Agent token drafts/receipts | Keep; distinguish draft, confirmed and absent token |
| `#/market` | Agent-scan/discovery presentation, not an all-token launch marketplace | Keep with honest provenance; expand only with real data |
| `#/traders`, `#/leaderboard`, `#/payroll` | Trading floor, rankings and Paper economy views | Keep as supporting Agent capabilities |
| `#/wallet` | Owner/Agent Wallet workspace | Keep; no duplicate custody/transfer implementation |
| `#/how` | Guide | Keep; rewrite launchpad-first explanation in a later phase |

The active router is `public/app/workspace.js`; the older `public/app/main.js` and `public/app/pages/*` are not mounted by `src/bootstrap.js` and should not be mistaken for current production routes. No route is removed in Phase 1.
- **Owner authentication (CURRENT 2026-10-02):** ordinary wallet connection displays the Solana address only. A separate explicit owner sign-in action reviews a challenge; API verifies its signature before issuing the HTTP-only session. Connection does not authorize signing or trading. Disconnect immediately detaches owner UI, retires provider listeners/pending responses and persists a nonsecret per-tab detach marker; offline logout does not prove server-cookie revocation or cross-tab invalidation. `/api/state` and `/api/agents/:id` retain server ownership checks. Chooser includes Phantom, Solflare and Solana-capable MetaMask. Pump approval still uses the Phantom Solana path; multi-wallet sign-in does not imply multi-wallet launch approval. Recovery tests and actual-user connection evidence are separated in WEBSITE_AUDIT.md.
- **API:** `server/index.js` creates `server/app.js`, verifies the real-money network and owns periodic reconciliation/Paper/analytics ticks. The API has a Mainnet safety middleware that blocks general Agent creation/updates beyond explicitly allowed actions. Health fields expose network and gating state without secrets.
- **Persistence:** `server/store.js` uses SQLite with WAL and a vault key. Agent identity is JSON in `agents.data`; Schema V2 permits `agents.secret=NULL` for identity-only migration. `agent_wallets` is separate encrypted custody. Paper, DEX and wallet transfer histories have distinct tables. The migration destination stores independently proven historical Mainnet records in `mainnet_migration_history`, not as active executions. SQLite main + WAL are persistent source state; SHM is an ephemeral WAL index.
- **Launch service:** `server/pump-launch-index.js` hosts `server/pump-launch.js`. It uses a separate JSON receipt journal and Prepare-attempt diagnostics under `DATA_DIR`; metadata is published to an explicitly configured public HTTPS origin. Prepare/build and owner-approved submit are separate. A signed uncertain outcome must be reconciled under the same signature, not retried as a fresh launch.
- **Paper trading:** simulated Agent state/history with explicit pause. It is not real SOL, even if market readings come from Mainnet.
- **Real execution:** custody, reservations, Risk/validator/simulation, DEX execution/receipt/position and autonomous modules exist in code, but availability depends on multiple independent flags and policy gates. Current `server/runtime.js` fails startup if `LIVE_TRADING_ENABLED` is set other than `false`; do not describe ordinary Live as enabled.
- **Real-money network:** `server/real-money-network.js` requires Mainnet genesis and one shared RPC topology for reads, blockhash, simulation, broadcaster, confirmation and reconciliation. The frontend network label is not a guard.
- **Production topology:** `docs/deployment/ubuntu-production.md` and `ecosystem.config.cjs` define Ubuntu/Nginx/PM2 with API and launch service bound to loopback. The manifest's funding, withdrawal, controlled, live and autonomous flags are closed. Legacy `deploy/` Caddy/systemd files and `docs/production-deployment.md` describe an older plan; they are not evidence of the current live host. This Phase 1 audit did not connect to `tekkteam.tech` or the VPS.

## Current strategy implementation

The active workspace supports `selective`, `balanced`, `momentum`: three parameter presets, ONE momentum/activity evaluator in `server/paper-engine.js`. Shared schema/defaults live in `public/app/strategy-config.js`; Paper state stores configuration/version and open positions retain entry-time configuration. Autonomous source reuses entry proposals but has independent Real policy and quote-based full-position exits. Controlled review is owner-directed, not another strategy algorithm. Source support is not runtime activation.

The research baseline found descriptive 5/10/15% exposure inconsistent with the active 10% default/ceiling. Phase A corrects descriptive metadata to that existing effective policy; it does not change engine limits. Legacy `public/app/main.js` custom choices are not mounted by the active bootstrap and do not count as supported strategies. See [research](research/LAUNCH-STRATEGY-RESEARCH.md) for exact preset differences, custom bounds and Paper/Real differences.

**Phase A CURRENT source:** `POST /api/agent-identities` is a narrow owner-authenticated/idempotent off-chain write without token/mint/launch/custody creation. Existing combined creation and Mainnet transaction middleware remain unchanged. Fresh databases use nullable secret; legacy relaxation occurs only on explicit identity creation and preserves rows/FKs/sequence. Already-nullable V2 is a no-op. No persistent local/production DB was upgraded during implementation.

`GET /api/strategy-registry`, owner `/api/agents/:id/operating-plan`, `/launch-lifecycle` and `/contract` are implemented. Registry maps existing IDs to Strict/Standard/Broad; metadata now reflects effective shared 10% default/ceiling, not legacy 5/10/15%. No Risk/engine limit changed. Operating Plan uses saved Paper config/version; separate risk revision remains unavailable/null, not fabricated. Disk-only Pump lifecycle returns reviewValidity UNVERIFIED, not fresh execution eligibility; malformed/mismatched journals are unavailable. Read endpoints do not reconcile, sign or build. Owner/public outputs enumerate allowed fields.

Public launch projection is a pure owner-bound opt-in allowlist with confirmed canonical Mainnet receipt requirement; no public discovery endpoint, publication store or auto-publication is implemented. Launch UX, persistent registry/risk revision history and publication remain TARGET. Trend and Recovery remain PLANNED/unselectable. No services or real-money gates change. See [decision 083](decisions/083-strategy-foundation.md).

## Target launchpad system

The **TARGET** system makes Agent identity the stable root (`agentId`) and gives Launchpad a first-class journey: identity → optional token draft → explicit Pump.fun review/approval → verified live Agent+token unit → optional Paper/Real capabilities. This is an information-architecture and lifecycle direction, not a replacement for existing custody, launch, transaction or reconciliation services. New Agent creation without token and a dedicated Launchpad page are not currently implemented.

## Research-integrated target system

The [PRD](PRD.md) now defines CREATE / DISCOVER / OPERATE and basic verified launch discovery as MVP TARGET. [ARCHITECTURE](ARCHITECTURE.md) defines future allowlisted public Agent/Token/Launch/Market/Activity projections and lifecycle/economic provenance. These are not implemented endpoints, stores or activated capabilities. Owner `/api/state` remains private; public discovery cannot be implemented by exposing it. No Calls page in MVP; future Signals are POST-MVP PLANNED. Existing transaction, custody and reconciliation services remain authoritative and unchanged. See [decision 082](decisions/082-launchpad-product-foundation.md).

## Operational truth and limitations

### Specification v1 direction, 2026-10-01

**TARGET:** Launchpad-specific Agents use a server-enforced `launched_token_only` policy derived from their confirmed associated receipt/mint, with SOL/WSOL as the counterpart; scanner/Calls inputs cannot expand this target. Preserve existing general bots and their configuration/discovery policies separately. This new target is not a claim that a product-mode discriminator or confirmed-target enforcement is implemented. Identity, token, wallet, runtime, funding and execution authorization remain independent. Default launchpad runtime is disabled or Paper only under verified capability; no launch or live activation is authorized by the specification. See DELIVERY_PLAN.md for source evidence and task boundaries.

1. A local code path is not proof of a currently enabled production capability. Check runtime flags and health before an operational claim.
2. A receipt is not a prepared attempt, and a prepared transaction is not a launched token.
3. Source-only audit cannot verify live Nginx config, PM2 processes, installed wallet extensions, RPC capacity or production database contents.
4. No server, launch service, transaction, deployment or VPS access was used for this document.

## Direct delivery source update - 2026-10-01

CURRENT local code now adopts the existing pure token configuration resolver through trusted constructor input and normal entry points. Missing/invalid configuration remains UNAVAILABLE. Existing DATA_DIR/PUBLIC_METADATA_ORIGIN are read by the explicit entry-point adapter; no env file was changed. API, Paper, lifecycle and Pump publisher share the configured journal/asset layout. Publisher stages exact static metadata and verifies an already provisioned HTTPS origin; automatic Vercel deployment fallback has been removed. A new journal is initialized only by explicit trusted options, never by corruption recovery.

The existing isolated owner preview remains 127.0.0.1:5198/frontend and 4290/backend, disposable seeded sessions, denied external RPC, no background trading jobs. Browser observations are guest context, not imported owner sessions or extension proof. All value-moving flags remain OFF and kill switches ON. Read DELIVERY_PLAN.md and direct-delivery checkpoint for current test/build/review evidence; earlier documentation-only statements remain historical.
