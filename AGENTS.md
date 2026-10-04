# TEKKTEAM instructions for coding agents

Latest user workflow2026-10-03: PROJECT_PLAYBOOK.md holds standing rules,
PROJECT_STATUS.md is current status, EXECUTION_BRIEF.md contains the single active
milestone/deadline. These supersede old master-prompt/delivery-ledger priority;
older docs remain technical/evidence references. Preserve existing safety gates.

Latest exact user assignment 2026-10-01 supersedes the previous batch boundary:
lead /root exclusively owns server/dex/pump-runtime-{executor,ledger,routes,adapter,risk}.js,
server/dex/routes.js additive default-off registration, server/app.js constructor
wiring, public/app/backend.js/workspace.js manual local-auth review only,
public/app/owner-auth-review.js, tools/local-owner-preview
isolated owner-auth harness files, tools/pump-existing-transaction.mjs, associated
new tests, docs and evidence. No parallel source writer. Independent reviewer is
read-only except artifacts/launchpad-continuation/direct-delivery/review.md.
Runtime Pump integration/settlement/finality is authorized locally through DI and
disposable fixtures, not runtime activation. Existing CPMM/custody/sign/send paths
must remain unchanged. Default Pump registration has no signing/broadcast ports.
Owner harness must use real challenge verification and isolated data; never seed
an authenticated human session or request signing automatically. Exactly one
getTransaction finalized for the existing standalone receipt signature is now
authorized through configured TEKKTEAM RPC; no other transaction/history lookup,
no signature/credential disclosure, no invented Agent association. Publisher
preparation remains local, with no nginx reload/deploy.

Exact direct assignment2026-10-01: lead/root owns local Pump curve/PumpSwap adapter, asset-aware fixture integration in server/dex/ledger.js and related new modules/tests; existing executor.js, intent.js, authorization.js, real-balance-reservations.js production behavior remains unchanged unless a separately reviewed scoped correction is necessary. Reviewer is read-only and owns direct-delivery/review.md only. Latest user explicitly permits configured TEKKTEAM Mainnet RPC account/program/pool reads ONLY, no signature/transaction/simulation/signing/broadcast or network/config change. Disposable preview migration is permitted only after fixture/no custody/no funds/no user data validation, preserving original directory and freezing old writer before final snapshot. Local adapter/accounting tests are DERIVED/LOCAL_FIXTURE, unmounted and disarmed; no production positions/receipts or permission inferred.

Current direct continuation evidence: latest docs/DELIVERY_PLAN.md ledger and artifacts/launchpad-continuation/direct-delivery/checkpoint.md supersede historical status claims without resetting consumed DOT attempts. Preferred metadata origin tekkteam.tech requires verified TEKKTEAM hosting linkage; no publication/deploy permission. Unmounted Pump proof-policy subset is DERIVED/DISARMED, never runtime venue/execution qualification.

Before substantial implementation, read these in order:

1. `docs/PRD.md` — product promise and lifecycle states.
2. `docs/SYSTEM.md` — what currently runs versus what is only target direction.
3. `docs/ARCHITECTURE.md` — domain, network and custody boundaries.
4. `docs/DESIGN.md` — one visual language and page templates.

For Home, Launchpad, discovery, creation or post-launch lifecycle work, also read `docs/research/LAUNCHPAD-COMPETITIVE-RESEARCH.md` and decision 082. DO NOT COPY COMPETITOR UI. Research supplies product principles, not visual templates, custody semantics or economic promises.

Substantial Launchpad refoundation work MUST consult `docs/LAUNCHPAD-IMPLEMENTATION.md` before implementation. Follow its dependency gates, unique page jobs, explicit CURRENT/TARGET boundaries and per-phase rollback/QA. The roadmap is not authorization to deploy, migrate, activate flags or transact; implement only the separately approved phase. One lead integrates overlapping source edits; delegate disjoint analysis/tests with explicit file ownership.

CREATE / DISCOVER / OPERATE are task modes in one AI Agent Launchpad. Label MVP TARGET and POST-MVP separately from CURRENT. No Calls page in MVP; future Signals remain conditional, read-only observations, not trades or guaranteed returns. Public projections must be explicit owner-opt-in allowlists, never owner-state dumps. Exclude custody/vault/private keys, credentials, capabilities, owner-only preparations and sensitive diagnostics. Canonical lifecycle events are facts, not authorization; projection/replay must not execute transactions. Economic displays require ON-CHAIN VERIFIED / BACKEND VERIFIED / DERIVED / UNAVAILABLE provenance with Paper/Real labels; no fabricated fees, PnL, market metrics or token-holder rights.

Then audit the relevant current source and existing decisions under `docs/decisions/`. Label evidence **CURRENT**, **TARGET** or **PLANNED** when ambiguity exists. Do not reinterpret positioning: TEKKTEAM is an **AI Agent Launchpad**, not primarily a trading-bot dashboard. Do not introduce a separate design system for each route.

Agent identity is valid without Token or Launch. Never assume `agent.coin` exists, fabricate a mint/token, restore a Devnet draft-mint secret, or hide an identity-only Agent. Agent ID is the relationship anchor, not permission to merge custody, launch, Paper and Real lifecycles. Do not rewrite historical provenance or promote Devnet/Paper/UNKNOWN to Mainnet success.

Preserve Mainnet genesis/network guards, owner authentication, custody isolation, exact intent/message/signature checks, idempotency, Risk, validator, simulation, reservations, one-shot claims and reconciliation. Never perform a transaction, sign, broadcast, deploy or connect to production without explicit user authorization. Never silently enable Funding, Withdrawal, Controlled Real, Live or autonomous trading; kill switches and emergency stop remain authoritative.

Before coding: inspect active bootstrap/routes and affected API/storage paths, then make the smallest change compatible with the source-of-truth docs. After coding: test desktop and mobile, null/empty/error states, identity-only and token-not-configured Agents, Paper/Real separation and Mainnet safety state; run relevant tests/build. Production verification must be distinguished from local fixtures.

Use parallel agents only for independent analysis or testing. One lead agent integrates implementation to avoid conflicting edits. Do not treat a target architecture or visual concept as already shipped.

## Strategy foundation

Read `docs/research/LAUNCH-STRATEGY-RESEARCH.md` and decision 083 before strategy/Launch configuration work. CURRENT Selective (`selective`), Balanced (`balanced`) and Momentum (`momentum`) are parameter presets over ONE momentum/activity engine, not three algorithms. TARGET Strict / Standard / Broad are filtering labels mapped to those IDs respectively; no runtime rename or risk guarantee is implied. Catalog exposure 5/10/15% conflicts with active default/ceiling 10%; treat this as unresolved implementation debt, never silently choose a new limit.

Distinguish archetype, preset, risk configuration, execution mode and execution authorization. Do not invent strategies for UI completeness, represent presets as separate algorithms, copy BAGWORK names/UI, expose PLANNED as AVAILABLE, add backend-unsupported risk controls or enable execution because a strategy was selected. Trend and Recovery remain PLANNED. Custom means typed, bounded, server-validated configuration, never arbitrary code or prompt-controlled execution.

Once implemented, consume the authoritative versioned Strategy Registry rather than duplicate catalogs. Render implementation status and unavailable capabilities explicitly; AVAILABLE never means execution authorized. Derive Operating Plan from actual configuration/effective policy. Test configuration separately from execution authorization, preserve immutable entry-policy/history revisions and all existing gates. No strategy save, token configuration, launch or funding action may implicitly authorize trading.

## Continuous local delivery workflow (direct user mandate, 2026-10-01)

Latest direct execution correction: one BLOCKED task never blocks independent eligible tasks. Record the exact withheld action/dependency, ask for specific missing access/approval once, then skip that task and continue without bypassing guards or treating silence as approval. After each independent review/repair, automatically claim the next ready task. Stop only on user pause, completion of all authorized work, or no eligible task; in the last case list each remaining task and concrete blocker. Current separately assigned scope includes controlled fixture-preserving preview restart, offline Pump/PumpSwap decoders/quote/simulation/executor integration and pending-transaction recovery tests WITHOUT signing/broadcast/Live/funding/deploy. Earlier PAPER-only limits do not prohibit this explicitly assigned disarmed local source/test contract; activation remains forbidden. Publisher blocks public metadata qualification only. Keep dirty baselines and existing custody/security gates.

Continue authorized Launchpad-first work using the task ledger and scoped contracts in [docs/DELIVERY_PLAN.md](docs/DELIVERY_PLAN.md). If a task is blocked, record its blocker and continue independent authorized tasks; do not bypass the blocker or reset consumed attempts. Track each task as TODO / RUNNING / BLOCKED / DONE with owner, dependencies, acceptance and actual evidence. DONE requires independent review of the final scope; local checks alone do not imply visual or release PASS.

Use up to three implementers and one independent reviewer only when explicitly assigned by ARCHANE. One lead exclusively integrates workspace.js, shared routing/schema, this file and DELIVERY_PLAN.md. Parallel writers must have disjoint exact file ownership and agreed interfaces before edits; shared dirty-workspace baselines are preserved. No other writer edits a claimed file. Review stays read-only until an explicit repair assignment.

Browser denials are respected and browser QA is recorded NOT VERIFIED; independent local tasks may continue. No Live/funding/withdrawal activation, custody/secret/security changes, data deletion, new Mainnet broadcast, production connection or deployment. Backend changes authorized for this continuation are PAPER-only and retain safety/kill switches. Unfinished DOT/receipt repair and its consumed attempts remain untouched. Existing legacy general agents, identity-only agents and Paper history remain valid.


### Accepted baseline and continuing brief

Latest direct user continuation (2026-10-01) authorizes local source receipt repair, trusted runtime configuration integration and launch journey integration after verifying the ARCHANE worker stopped. The idle worker was stopped without editing DOT evidence; historical DOT BLOCKED2 attempts remain unchanged. Sole lead integrates shared files; independent reviewer remains read-only. Default publisher cannot deploy automatically. Current local receipt file-sync/replacement acknowledgement does not imply Windows power-loss proof. Keep real wallet authentication/signing, external delivery, funding and Live qualification distinct from disposable tests. See direct-delivery checkpoint and latest ledger before resuming; do not replay the earlier identical DOT repair.

Follow the latest concrete backlog/contracts in docs/DELIVERY_PLAN.md, including the 2026-10-01 continuing-brief reconciliation. Preserve independently accepted wallet restoration122/122 and associated-coin Paper integration152/152; neither proves actual extensions/browser or Live enforcement. Home CTA target is exactly Launch Coin + Agent; preserve all ten destinations and Payroll. Use actual deterministic rules-based strategy wording. Current runtime/wallet writer owns its claimed files until ARCHANE releases locks; documentation lead must not touch them. Backend continuation authorization remains PAPER-only; broader Real enforcement requires an exact separately assigned contract, never activation. Independent eligible tasks progress without waiting for unrelated receipt repair; blocked tasks retain reasons/attempts. Each task checkpoint records applied/draft/reviewed/unverified, tests/build and visual limits.
