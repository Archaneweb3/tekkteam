# Launchpad-first implementation roadmap

Status: execution roadmap, 2026-09-30. **All implementation described here is TARGET.** This document does not authorize runtime changes, deployment, migration, services, signing or transactions. It preserves the existing system, not a rewrite. Authoritative inputs: [PRD](PRD.md), [SYSTEM](SYSTEM.md), [ARCHITECTURE](ARCHITECTURE.md), [DESIGN](DESIGN.md), [launchpad research](research/LAUNCHPAD-COMPETITIVE-RESEARCH.md), [strategy research](research/LAUNCH-STRATEGY-RESEARCH.md), decisions [082](decisions/082-launchpad-product-foundation.md) and [083](decisions/083-strategy-foundation.md), and root AGENTS.md.

## 1. Baseline and execution constraints

CURRENT active entry: `index.html` → `src/bootstrap.js` → `public/app/workspace.js`. `glass-navigation.js` adds Trading, Leaderboard, Payroll and Wallet to the initial Home/Agents/Tokens/Market/Guide navigation. Launch has a route but no first-class sidebar entry. `#/launch` chooses an existing Agent and opens the Pump flow from Agent Detail. Home mounts `renderWorkspaceMap` and `overview-dashboard.js`: Paper network/top/leaderboard presentation, Trading Desk and owner Payroll. Do not mistake legacy `main.js` or `pages/*` for mounted routes.

CURRENT creation requires token name/ticker and generates a Devnet draft-mint secret; general Mainnet Agent writes are restricted. Schema V2 reads already support `coin:null` and `agents.secret=NULL`. A new identity-only write contract requires explicit implementation/security review, not blanket removal of Mainnet middleware. No production contents or flags have been inspected in this planning phase.

Preserve owner auth, Agent IDs, custody encryption, Mainnet genesis/RPC topology, Pump construction/payer semantics, Paper isolation, Real execution ports, Risk, validation/simulation, expiry, reservations, one-shot claims, reconciliation, Market/Wallet/analytics and deployment topology. No UI acceptance requires real-money movement. No phase implicitly opens Funding, Withdrawal, Controlled, Live or autonomous flags. UNKNOWN stays locked and reconciles the same signature. Configuration, launch, funding and execution authorization remain distinct.

No Calls sidebar/page in MVP. Future Signals can reference canonical allowlisted lifecycle/observation events with provenance; no event replay or projection triggers execution. No creator-fee/reward/token-holder entitlement is invented.

## 2. Final navigation and unique page jobs

Keep **Home**, rather than rename it Overview: active route and previous accepted user terminology support Home. Retain `#/overview` as its route. Agent Detail has its own Overview tab. Groups are quiet structural labels, not four nested sidebars.

Home, Launchpad, Agents, Tokens, Market, Trading, Wallet, Leaderboard, Payroll and Guide each retain a separate destination and page job. Grouping does not merge routes or jobs: never combine Market/Trading or Wallet/Leaderboard.

| Group | Label → existing route |
| --- | --- |
| CORE | Home → `#/overview`; Launchpad → `#/launch`; Agents → `#/agents`; Tokens → `#/tokens`; Market → `#/market` |
| OPERATIONS | Trading → `#/traders`; Wallet → `#/wallet` |
| ECOSYSTEM | Leaderboard → `#/leaderboard`; Payroll → `#/payroll` |
| SUPPORT | Guide → `#/how` |

No new top-level route is necessary. Keep `#/agents/new`, `#/agent/:id`, current detail tabs and legacy compatible links. The Create wizard is reachable from Launchpad; publication/result may use lightweight state within existing routes, not a new app.

| Page / single job | Primary user question / primary action | Secondary actions | Data shown | Access | Must not appear |
| --- | --- | --- | --- | --- | --- |
| Home / orient | What is TEKKTEAM and where do I start? / Launch Agent | Explore Launchpad, resume own work | Product explanation, small verified launch/activity preview | Public orientation; separate private resume | Full launch form, private Wallet dumps, trading-first hero |
| Launchpad / create and resume launch lifecycle | How do I launch or inspect a verified launch? / Launch Agent or resume exact owned attempt | Explore published launches, open linked Agent | Published confirmed launch units + separate owner pipeline | Public discovery; owner-only drafts/review | Unverified “live” tokens, whole private state, duplicate Market board |
| Agents / manage operator identities | Which Agents do I own? / Create Agent | Search/filter, open Agent | Owned identities, optional token and capability status | Owner roster; public units belong to Launchpad projection | Fake tokens, public owner-state dump, duplicated token inventory |
| Agent Detail / operate one Agent | What is this Agent's current state and next safe action? / next authorized action | Token/launch status, Wallet, tabs | One canonical Agent + capability/plan/position/history | Existing owner view; public-safe detail only if separately scoped | Entire ecosystem feed, hidden mandatory token, global trading activation |
| Tokens / linked asset inventory | What tokens connect to my Agents? / inspect token lifecycle | Resume launch, Pump link after confirmation | Configured drafts and proven token/launch associations | Owner inventory | Agent-only fake token cards, all external coins |
| Market / external context | What is happening across eligible markets? / inspect market | Source/explorer, related published unit | Sourced market snapshots/coverage/freshness | Public-safe context; private scans separate | Owner token inventory, fabricated prices, implied execution eligibility |
| Trading / capability oversight | What are my Agents doing in Paper or authorized Real? / open Agent controls | Filter mode/activity, inspect reason | Mode-separated canonical decisions/positions | Owner controls; existing sanitized reads separately qualified | Launch form, AI discretion claims, auto-Live switch |
| Wallet / treasury visibility | Where are owner/Agent funds and permitted transfers? / Manage Wallet | Refresh, gated deposit/withdraw/history | Actual balances/holdings and bound history | Owner-authenticated | Secrets, Paper as SOL, second transfer implementation |
| Leaderboard / compare evidence | How do comparable published Agents perform? / inspect Agent | Sort/filter mode/sample | Existing qualified rankings with mode/provenance/coverage | Public only approved projection; no forced publication | Mixed Paper/Real ranking, invented profit, zero-data winners |
| Payroll / owner operating finances | How is my workforce's performance accounted for? / inspect Agent | Mode/time filters | Existing owner Paper finance; proven Real only if supported | Owner | Creator-fee revenue relabeled PnL, fabricated wages/income |
| Guide / teach next safe step | How do I create/launch/operate safely? / open category guide | Contextual existing routes | Actual behaviors, states, mode/cost/permission explanations | Public | Six duplicate manuals, unsupported capability promises |

## 3. Primary Launchpad composition

Order, using shared section/panel language rather than generic KPI cards:

1. **Launchpad header/hero:** one product statement, LAUNCH AGENT → existing wizard, EXPLORE LAUNCHES → on-page public feed. Agent identity/token optionality and approval separation visible.
2. **Recent confirmed launches:** compact Agent + Token units with publication-approved identity, mint/network, confirmation reference/time and linked destination. “Confirmed launch” is not Live trading. Only publishable reconciled receipts qualify; pending drafts never enter this feed.
3. **Your launch pipeline:** owner section; identity draft / token configured / prepared / awaiting approval / submitted / confirmed / failed / reconciliation required. These are read-model states, not a replacement enum. Select exact canonical attempt/receipt, show expiry and same-signature recovery. Disconnected visitor gets a compact connect-to-resume prompt, not private data.
4. **Explore:** expand the same public launch dataset with search/filter/pagination; do not repeat recent cards as a second feed or duplicate external Market. Agent/token relationships are the content unit.
5. **Create → Launch → Operate:** short truthful explanation and Guide link. No automatic trading promises.

Build now from existing authorities: owner Agent list/null token, token drafts, Pump status/attempt/receipt, reviewed costs and existing resume functions after contract qualification. Backend work required: public opt-in publication, deny-by-default launch projection, pagination, persistent publish controls and unified owner lifecycle projection across API/launch journals. No fake feed while absent: render honest empty/unavailable state. Pump UI adapter must reuse `src/pump-launch-ui.js`, not reconstruct transactions.

## 4. Home composition and component disposition

Order: (1) authored robot/office identity with launchpad statement and Launch Agent / Explore Launchpad; (2) three-step Create/Launch/Operate explanation; (3) small recent verified launch preview + view all; (4) capability truth: linked identity/token, Wallet and Paper utility while Real gated; (5) concise actual lifecycle/activity preview; (6) signed-in resume panel; (7) Guide/final CTA.

KEEP high-quality robot/office/WebGL interaction where it supports identity and next action; preserve scene disposal/performance. REPURPOSE New Hires as identity/launch units only with proper provenance and access, not “all new Agents launched.” REPURPOSE Trading Desk preview into truthful lifecycle/activity with explicit Paper labels; existing trade rows can remain secondary. MOVE full rankings and AUM/PnL-first summaries to Leaderboard/Trading/Payroll; MOVE full owner Payroll grid to Payroll and replace with compact resume summary. REMOVE duplicated financial metrics and competing full-size trading CTAs from Home composition, not their domain functionality/routes.

WebGL2 unavailable: intentional static existing robot/office asset plus identical readable message/CTAs; scene failure must not suppress navigation, auth or data. No generated fake market art/data. Provide reduced-motion/lightweight fallback and no perpetual loader. Public hero/Guide remains usable without owner session or API; private section failure is localized.

## 5. Create, review and post-launch funnel

1. **Identity:** character, name, description; save stable owner-bound Agent independently. No mint secret required. Session/ownership remain mandatory for writes.
2. **Optional Token:** name/ticker/image/description validated using existing product rules; SKIP FOR NOW persists `coin:null`. Skip branches directly toward paused Agent operation after strategy/review, with no Pump preparation/approval.
3. **Strategy:** one momentum/activity behavior; Strict=`selective`, Standard=`balanced`, Broad=`momentum`. Lowercase stored IDs preserved. Show actual Operating Plan, supported modes and unavailable reasons. Current bounded custom fields may be reused; unsupported archetypes/controls remain unavailable.
4. **Capital/Risk:** configure supported fields only. Phase A resolves authoritative metadata projection before exposure presentation: retain effective validated default/ceiling 10% unless separate policy decision explicitly authorizes a change; remove or label contradictory 5/10/15 catalog metadata, never silently choose differentiated budgets. Show configured vs binding caps, starting-capital basis, fees/rent and paused/safety semantics. Paper cap is not Real authorization.
5. **Review:** identity, optional token, pinned plan revision, actual payer/Wallet roles, independently required capital, launch costs and permissions. Missing cost stays pending, not zero. Launch initial buy is separate from operating allocation. Draft save is not launch preparation.
6. **Prepare:** existing Pump path, exact reviewed intent/new deliberate idempotency key, build/validate/simulate, persist unsigned review with expiry. No signing/broadcast and no auto-retry. Do not reuse expired artifact.
7. **Owner approval:** explicit existing wallet action, exact transaction/payer/mode/amount; cancellation remains cancellation, not success.
8. **Result:** on-page result within existing Launchpad context: CONFIRMED, PENDING, FAILED or RECONCILIATION REQUIRED derived from canonical evidence. Uncertain signature stays bound; status checks do not create a new attempt.

**Chosen destination:** Launch Result → explicit OPEN AGENT action to `#/agent/:id` Overview, preserving mint/receipt links and exact attempt. Keep pending/reconciliation owners in result/status until known; never route them to an invented live success. Tokenless save goes to Agent Detail with TOKEN NOT CONFIGURED. Confirmed result offers view token/Pump.fun, manage/fund Wallet if independently permitted, configure operation, Paper testing, activity/performance. Operation remains paused and permission-gated; no auto-start.

Agent Detail is OPERATE, not another Launchpad: persistent identity; Overview shows compact token/launch state, Wallet link and Operating Plan; Trading is decisions/positions/control; Performance analytics; Activity facts/history; Settings edits. Preparation/result workflow resumes canonical Launchpad context, not a competing launch implementation buried in Settings. Same Manage Wallet drawer reused from Settings/Delete/future workspace. Token inventory excludes tokenless identities but offers separate informational empty/Agent link, not fake token records. Market external snapshots never imply supported pool or executable routing.

## 6. Contracts, registry and storage plan

All endpoint/file names below are **proposals**, not currently implemented contracts. Validate naming against active Express and Pump proxy before coding.

| Proposed contract | Authority, access and implementation boundary |
| --- | --- |
| Owner identity create/update | Scoped owner-authenticated API actions, Schema V2 nullable secret; token optional. No general Mainnet middleware bypass or Devnet secret creation. Validate IDs/owner and idempotency |
| Optional token draft update | Agent-bound validated metadata, no minted-state claim; initially reuse embedded nullable coin, do not force a Token table split |
| GET `/api/strategy-registry` | Server versioned public-safe definitions/preset labels/status; no private config/capabilities; canonical proposed module `server/strategy-registry.js`; reuse shared validator, do not fork math |
| Existing strategy-config GET/POST | Keep optimistic version validation; future adapter binds registry/config/risk revisions without renaming persisted IDs |
| GET `/api/agents/:id/operating-plan` | Owner-only saved config + independently effective policy/mode/status, fixed/editable rules, freshness/revisions/unavailable reasons; no side effects |
| GET `/api/agents/:id/launch-lifecycle` | Owner projection of canonical Agent/token + current exact attempt/receipt; adapter over existing Pump status, not new transaction path |
| POST publication + GET `/api/public/launches` | Explicit owner opt-in write and allowlisted confirmed feed read, cursor/schema/version/source timestamps; private drafts/diagnostics/capabilities excluded |
| Existing Pump prepare/review/submit/status | Preserve request/payer/exact message/idempotency/expiry semantics and configured proxy; consume through one frontend adapter |
| Existing Wallet/Trading/Market/analytics reads | Reuse owner/mode/provenance contracts; projection changes must not affect execution |

Registry: immutable archetype/preset versions, definitions with entry/exit/data/schema refs; AVAILABLE/EXPERIMENTAL/PLANNED with per-mode qualification. Real availability is separate from status. Trend/Recovery PLANNED, not selectable. Custom is bounded supported configuration; no time-horizon editor when fixed. Browser consumes server catalog and shared field schema, no parallel policy map. Operating Plan answers behavior/profile/entry/exit/capital/risk/horizon/mode/status from real config with effective bounds, not invented descriptions.

Storage impact is incremental and gated: identity-only writes reuse existing Schema V2; optional token remains embedded initially. Registry definitions can be versioned in source without a mutable table. Immutable Agent configuration/risk revision history and publication metadata may need additive SQLite schema plus backfill references; design exact schema in A, implement only after explicit approval. Existing snapshots/history must not be rewritten; missing legacy revisions remain identified legacy, not fabricated. No migration of custody, no mixed-to-Mainnet promotion, no copied Devnet mint material. A cross-store lifecycle projection needs consistency/version/conflict rules; do not claim atomic SQLite+JSON writes. A unified event/outbox system is not prerequisite for MVP if canonical versioned reads suffice. Future Signals reuse projection/event envelope, not a new MVP service.

## 7. Shared implementation primitives

Lock tokens early in A/B; consolidate incrementally in K after routes pass, not one giant CSS rewrite.

| Primitive | TARGET implementation rule |
| --- | --- |
| Shell | Existing desktop rail 216px; one content grid, route-scoped modifiers; no global selector leakage |
| Width/gutters | Normal primary region max 1280px; 36px desktop / 18px mobile; intentional office full-bleed exception documented |
| Spacing | 4/8/12/16/24/32/48px; section gaps32–48, grid gaps16–24, dense row gaps8–12 |
| Radius/surfaces | Utility5px, panels12px, existing CTA~10px; canvas→section→panel→row, avoid nesting stacks |
| Type | Existing Lilita display, Nunito UI, monospace addresses/data; normal title32px desktop/28px mobile, section24/22, body16, secondary14, essential meta≥12px; feature hero44/32 only where intentional |
| Buttons | Existing yellow primary/blue secondary/shared danger/text; touch height44–48px, compact icon target44; no route gradients/padding systems |
| Icons/status | Existing shared UI icon family, sidebar image assets, official wallet artwork; explicit text+semantic color; draft/pending/unknown/confirmed and Paper/Real are distinct |
| Density | Desktop repeated rows48–56px, essential text≥12; mobile identity/action first with disclosed fields, no tiny shrunken table |
| Charts | Shared panel/header/controls, no fabricated interpolation; gaps remain gaps, source/mode/time/units, internal layout min-width0; responsive height240–320px |
| Breakpoints | Preserve existing900px shell behavior; at390 single column, no horizontal page overflow, reachable drawer/CTA, mobile sheet; desktop1440 left rail+readable workspace |

Create/reuse SectionHeader, Panel, MetricRail, StatusBadge, DataRow, Field, Button/IconButton, Disclosure, SharedDrawer, Mode/ProvenanceLabel, Empty/ErrorState and OperatingPlan components in the existing lightweight module architecture. Do not introduce a framework migration. `styles.css`, `workspace.css`, `art-direction.css`, world/hero/sidebar/route overrides and layered `index.html` styles are consolidation candidates; remove a selector/file only after consumers/route regressions are proven covered. Preserve Home authoring, wallet logos and working responsive interactions.

## 8. Phase gates and collaboration

Every phase inherits these explicit contracts: **Safety impact:** no execution permission/transaction change; **Do not change:** auth/custody/network/Risk/transaction semantics/expiry/claims/reconciliation/deployment flags; **Tests:** fixtures and isolated temporary databases only, relevant existing tests/build, no production state; **1440 acceptance:** hierarchy, focus and readable review; **390 acceptance:** no overflow, large targets, same data/actions; **Null/empty:** tokenless Agent and unavailable ≠ zero; **Errors:** localized safe errors, retained canonical state, no auto-retry. Phase-specific additions follow. These are requirements, not tests already passed.

One lead owns overlapping integration. Research agents inspect only; backend agents own delegated contract/isolated fixtures; visual audit agents review without editing shared CSS; mobile/regression agents own isolated tests/evidence. Parallel work is allowed only on disjoint files/contracts, with explicit file ownership. No agent may independently change feature flags or perform deployment/value movement.

### A — Foundation contracts and projection qualification

- **Goal / why now:** make identity-only, strategy, effective limits, publication and lifecycle contracts truthful before rendering.
- **Visible result:** no redesigned page yet; qualified fixtures/read models with canonical state and permission reasons.
- **Files / routes:** `server/app.js`, `store.js`, `config.js`, `agent-trading.js`, shared strategy schema, proposed registry/projection modules; existing Agent/launch routes.
- **API:** contracts in §6; resolve exposure projection inconsistency without new risk policy.
- **DB / migration:** design additive revision/publication storage and explicit nullable-create projection; temporary upgrade/backfill fixtures; no production apply. Preserve old snapshot values and vault pairs.
- **Dependencies:** decisions082/083; baseline compatibility tests and production-schema inventory through separately authorized read-only evidence.
- **Parallel / owner:** research maps actual serializers; backend drafts schema/projections; visual audits data needs; regression tests auth/null/privacy; lead integrates contracts.
- **Tests:** owner isolation, coin null, strict config/mode, metadata/default consistency, allowlist denies new/private fields, no transaction method reachable from reads.
- **1440 / 390:** plan/lifecycle fixture labels and units readable; no UI overhaul.
- **Null/errors:** absent token/Wallet/revision/publication, unavailable RPC/status, cross-store conflicting versions fail closed.
- **Safety / do not change:** inherit global gates; new Mainnet identity-write allowlist requires narrow security review.
- **Rollback:** additive contract/module release, old serializers retained; never rollback by deleting history or restoring Devnet secrets.

### B — Navigation and minimum shared primitives

- **Goal / why now:** first-class Launchpad and stable shared layout before page work.
- **Bounded scope:** navigation/route hierarchy and minimum shared primitives only. Preserve practical existing routes and one design system. No major page redesign or full Launchpad composition; those belong to later separately authorized phases. Validate 1440 desktop and 390 mobile, including identity-only, empty/loading/error and disconnected states.
- **Visible:** final grouped sidebar with Home label; existing links/routes retained.
- **Files / routes:** workspace/glass-navigation/sidebar-icons, index styles and scoped shared tokens; all sidebar routes.
- **API / DB / migration:** none new; A qualified availability only; no schema change.
- **Dependencies:** A naming/data availability; approve shared token/primitive inventory.
- **Parallel / owner:** research traces active nav; backend verifies no contract drift; visual audits hierarchy; regression owns keyboard/mobile routing; lead alone edits nav/shared CSS.
- **Tests / 1440 / 390:** every route/deep link/back, active label, wallet utility unchanged;216px rail;900px collapse,390 no clipped actions.
- **Null/errors:** disconnected/backend unavailable navigation still works; no duplicate injected links.
- **Safety / do not change:** auth and utility behaviors preserved, no flag changes.
- **Rollback:** nav/token-scoped revert, keep route aliases and data untouched.

### C — Primary Launchpad surface

- **Goal / why now:** expose creation, verified discovery and owner resume before funnel expansion.
- **Visible:** §3 exact sections; existing wizard/prepare adapter links work.
- **Files / routes:** workspace launch handler, new launchpad module/shared primitives, agent-launch-data adapter; `#/launch`.
- **API:** owner lifecycle/public feed; no new prepare semantics.
- **DB / migration:** publication metadata only if A approved additive migration; no launch/custody migration.
- **Dependencies:** A projections, B navigation; use current wizard until D.
- **Parallel / owner:** research fixture canonical states; backend feed contract/privacy tests; visual reviews; regression mobile/status; lead integrates UI.
- **Tests / 1440 / 390:** owner/public data separation, feed pagination, exact resume; desktop scan hierarchy; mobile sections/CTA readable.
- **Null/errors:** no published launches, no session, pipeline unavailable, expired/unknown attempt distinct; no fake counts.
- **Safety / do not change:** no visitor private state, frontend cannot certify success.
- **Rollback:** route presentation revert; publication/history preserved, no reset attempts.

### D — Identity / optional Token / Strategy funnel

- **Goal / why now:** replace required-token creation with truthful §5 journey.
- **Visible:** skip token, save paused identity, one behavior/three profiles and actual review.
- **Files / routes:** workspace create handler, shared wizard/registry/OperatingPlan, existing strategy/launch adapters; `#/agents/new`, `#/launch` resume.
- **API:** A scoped identity/token write and existing config/version APIs; existing Pump prep only explicit owner action.
- **DB / migration:** Schema V2 writes plus approved additive revisions; no Devnet draft secret, no runtime ID rename.
- **Dependencies:** A write security/limits resolution; B/C; explicit review before production migration.
- **Parallel / owner:** research funnel contracts, backend write fixtures, visual review, regression owner/cancel/reload/null tests; lead owns wizard integration.
- **Tests / 1440 / 390:** token skip persistence, wrong owner rejected, revisions, invalid parameters, stale version, duplicate click, cancellation and expired review; desktop clear step/summary; mobile same decisions without shrinking.
- **Null/errors:** coin null, upload/balance/service failure, unavailable cost, no wallet, state conflict retains draft; no auto-Prepare.
- **Safety / do not change:** highest write-contract risk; narrow allowlist, same payer/build/sign/submission boundaries.
- **Rollback:** wizard/UI revert and additive schema-compatible server rollback; preserve created tokenless Agents and revision history.

### E — Launch result and lifecycle return

- **Goal / why now:** meaningful canonical result rather than token launch as dead end.
- **Visible:** Result → Open Agent; same-attempt pending/unknown recovery, confirmed mint/Pump links.
- **Files / routes:** launchpad result module, pump-launch-view-state/UI adapter, agent-launch-data; existing launch/detail routes.
- **API:** existing status/review/submit and qualified lifecycle projection; no automatic resubmit.
- **DB / migration:** none beyond A; retain JSON/SQLite authorities, no cross-store history rewrite.
- **Dependencies:** C/D canonical bindings and reviewed contracts.
- **Parallel / owner:** research state transition matrix; backend reconciliation contract fixtures; visual outcome audit; regression race/expiry tests; lead integrates result.
- **Tests / 1440 / 390:** prepared≠confirmed, signature null≠failure, no stale error from another attempt, reload/resume; clear network/payer/outcome on both sizes.
- **Null/errors:** missing receipt, service down, conflicting state, expired unsigned, UNKNOWN all explicit.
- **Safety / do not change:** reconciliation side-effect policy stays authoritative; no retry/new signature.
- **Rollback:** result projection/presentation revert, preserve receipts/reservations and safe status access.

### F — Agent Detail OPERATE alignment

- **Goal / why now:** complete post-launch workspace without another Launchpad.
- **Visible:** token/lifecycle, Wallet and Operating Plan compactly surfaced; existing five tabs remain.
- **Files / routes:** agent-detail-tabs, overview/trading/settings modules, agent-wallet/shared drawer; `#/agent/:id`.
- **API:** reuse qualified owner lifecycle/plan/Wallet/Paper/analytics; no domain duplicate.
- **DB / migration:** none new.
- **Dependencies:** A/E; current identity-only regression retained.
- **Parallel / owner:** research relation/state audit; backend fixture compatibility; visual composition audit; regression five-tab mobile/null; lead integrates tab changes.
- **Tests / 1440 / 390:** direct deep link, tokenless/custody association, same execution state, drawer reuse; desktop subordinate tabs; mobile compact status/actions.
- **Null/errors:** token not configured, Wallet absent, no history, capability unavailable, stale plan explicit.
- **Safety / do not change:** no control relocation changes authorization; no auto-start.
- **Rollback:** tab-specific revert; existing launch status/Wallet access preserved.

### G — Home launchpad-first orientation

- **Goal / why now:** point orientation at working C–F flow, not unbuilt promise.
- **Visible:** §4 order with preserved authored office and static fallback.
- **Files / routes:** workspace home, overview-top/dashboard/feed, workspace-map consumers, scoped Home CSS; `#/overview`.
- **API:** approved public launch/activity preview; private resume separate owner API; no new data authority.
- **DB / migration:** none.
- **Dependencies:** C/E/F usable; B shared primitives.
- **Parallel / owner:** research existing section/scene lifecycle; backend preview privacy; visual baseline art audit; regression WebGL fallback/mobile; lead integrates Home only.
- **Tests / 1440 / 390:** initial/middle/end composition, scene disposal/reduced motion/noWebGL, CTAs and source labels; readable first viewport; mobile fallback/action parity.
- **Null/errors:** API unavailable leaves orientation, empty launch feed honest, no private data when disconnected.
- **Safety / do not change:** no scene click launches/signs; no published private metrics.
- **Rollback:** Home-only composition revert, preserve working routes and assets.

### H — Tokens and Market separation

- **Goal / why now:** remove directory overlap after launch semantics stable.
- **Visible:** owned asset lifecycle inventory vs external market context.
- **Files / routes:** workspace token handler, market-page/radar modules, agent-launch-data; `#/tokens`, `#/market`.
- **API:** existing inventory and market adapters with proven lifecycle/source fields; no new execution adapter.
- **DB / migration:** none; no unnecessary Token aggregate split.
- **Dependencies:** A/C/E and publication/receipt qualification.
- **Parallel / owner:** research market provenance; backend data fixtures; visual row audit; regression null/unavailable/mobile; lead integrates disjoint route modules.
- **Tests / 1440 / 390:** tokenless excluded as token, draft≠mint, market listing≠launch/executable pool; readable rows/disclosures, no global CSS leak.
- **Null/errors:** zero tokens, unknown mint/price/metadata, indexing delay, provider failure not zero values.
- **Safety / do not change:** marketplace/support-buy/auto-routing out of scope.
- **Rollback:** independent route/projection revert, no records deleted.

### I — Trading and Wallet capability positioning

- **Goal / why now:** align supporting operations without engine changes.
- **Visible:** explicit Paper/Controlled/Autonomous separation and owner/Agent Wallet hierarchy.
- **Files / routes:** trading-pages/projection UI, wallet-workspace, shared Manage Wallet; `#/traders`, `#/wallet`; Payroll/Leaderboard label alignment only.
- **API:** existing eligibility/Wallet/transfers/analytics; unavailable modes explicit, no new signing flow.
- **DB / migration:** none.
- **Dependencies:** A/F/H, effective policy already qualified.
- **Parallel / owner:** research existing transfer/capability binding; backend unchanged-contract fixtures; visual hierarchy audit; regression mode/owner/mobile; lead presentation integration.
- **Tests / 1440 / 390:** no permission changes on profile save, actual balances/asset count, same drawer/deposit/withdraw, double-click guards; desktop clear treasury; mobile single-sheet steps.
- **Null/errors:** unavailable SPL holdings not zero, no custody record, locked actions exact reason; UNKNOWN retained.
- **Safety / do not change:** transaction/funding/withdrawal/live gates and engine untouched.
- **Rollback:** UI-only route revert; no request/state reset.

### J — Guide and onboarding

- **Goal / why now:** describe shipped paths, not target behavior prematurely.
- **Visible:** concise creation/launch/operate guide categories, contextual drawer and next safe action.
- **Files / routes:** guide-landing/drawer content and existing contextual links; `#/how`.
- **API / DB / migration:** none; generic explanations public.
- **Dependencies:** D–I actual behavior qualified.
- **Parallel / owner:** research verifies factual copy; backend reviews safety wording; visual drawer audit; regression focus/scroll/mobile; lead content integration.
- **Tests / 1440 / 390:** category opens correct drawer, no anchor scroll, Escape/overlay/focus return; desktop right drawer; mobile full-width sheet.
- **Null/errors:** disconnected/tokenless/gated scenarios explained, broken links tested.
- **Safety / do not change:** no Guide CTA bypasses owner/permission.
- **Rollback:** content/drawer-only revert.

### K — Incremental design consolidation

- **Goal / why now:** remove verified duplication after functional compositions stabilize.
- **Visible:** coherent tokens/buttons/rows across routes, no new design.
- **Files / routes:** §7 CSS/component inventory, index stylesheet ordering; all routes one batch at a time.
- **API / DB / migration:** none.
- **Dependencies:** B primitives and C–J route acceptance snapshots.
- **Parallel / owner:** research selector consumers; backend no contract work; visual before/after audit; regression owns route/state screenshot matrix; lead sole shared CSS owner.
- **Tests / 1440 / 390:** all routes/null/loading/error/drawers/WebGL/connected states; no cascade leakage, focus or contrast regression.
- **Null/errors:** shared components retain explicit empty/error/disabled states.
- **Safety / do not change:** visibility does not modify eligibility, no hidden enabled action.
- **Rollback:** one stylesheet/component consolidation per commit; keep assets until all references verified removed.

### L — Production release qualification (separately authorized)

- **Goal / why now:** prove deployable release without assuming local=production.
- **Visible:** verified release candidate, then live evidence only under explicit deployment approval.
- **Files / routes:** tests, release checklist and existing deployment docs/manifest; no topology rewrite.
- **API:** same-origin/proxy/auth/session/contracts smoke tests in isolated staging.
- **DB / migration:** approved additive upgrade on production-like sanitized clone; backup/restore and compatible rollback evidence. Never apply to live DB without explicit authority.
- **Dependencies:** all prior gates; actual production version/schema/config inventory, secrets excluded; deploy permission separately requested.
- **Parallel / owner:** research release evidence; backend staging contract/auth/schema tests; visual final audit; regression full desktop/mobile/state suite; lead alone integrates/releases when authorized.
- **Tests / 1440 / 390:** relevant backend/frontend suites, full npm test twice, build; browser routes/deep links/forms without wallet approval; both sizes plus intermediate viewport, performance/accessibility.
- **Null/errors:** offline/API/launch unavailable, null relations, expired/unknown/history and unauthenticated cases across routes.
- **Safety / do not change:** no real-money test required; compare flags/genesis/custody-public binding without secrets/signing; current production controls unchanged.
- **Rollback:** known-good frontend/API artifact, compatible additive schema and verified backup; never restore old DB over newer transaction state. Stop rollout on unresolved custody/auth/unknown lifecycle mismatch.

## 9. Dependency order, risk and first work package

Order: **A → B → C → D → E → F → G → H → I → J → K → L**. H data/provenance tests may run alongside G after E; J content research may run earlier but ship only after behavior exists. Small shared primitives land in B, so K is debt removal rather than waiting until the end to establish a system. C initially links the existing wizard; D replaces the funnel after contract readiness, avoiding circular dependencies.

Highest risks: A/D Mainnet write permission and nullable identity compatibility; A/C publication privacy and cross-store lifecycle truth; E expiry/UNKNOWN/idempotency; K global CSS cascade; L schema/deploy rollback under real state. Gates block dependent UI if source/projection evidence is insufficient. Exposure mismatch is a contract correction under existing effective limits, not approval of new exposure. No scope creep into new strategy algorithms, market making, Signals MVP, framework rewrite or trading engine expansion.

**First implementation phase:** A only, upon explicit approval. Package: active contract baseline tests; nullable owner-bound Agent write design; effective strategy metadata under existing limits; versioned registry/plan and lifecycle/publication projection contracts; temporary fixtures and privacy/safety tests; schema proposal and rollback review. Do not start Home redesign first. Do not combine all phases in one release.

For each phase delivery record: baseline commit/files, approved scope, contract versions, tests/browser evidence, flags unchanged, DB/migration status, rollback artifact and known gaps. Never call TARGET available merely because a fixture passes. This roadmap has no runtime QA results; document links/structure and phase coverage are the validation for this planning task.

Implementation: NONE. Production: UNCHANGED. Database: UNCHANGED. VPS: NOT TOUCHED. Transactions/signing/broadcast: NONE.
