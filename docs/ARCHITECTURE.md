# TEKKTEAM architecture boundaries

CURRENT 2026-10-01: passive launch evidence reuses the strict receipt journal reader; missing/corrupt authority is unavailable and projection never initializes/reconciles it. Explicit metadata publisher and image verifier share resolved asset root/origin; ambient historical origin is not publication authority. New pump-venue-policy is an unmounted offline DERIVED/DISARMED binding subset, not an on-chain verifier, adapter, authorization or runtime route. Completed curves remain MIGRATED_VENUE_UNVERIFIED; account decoder, extensions and PumpSwap qualification remain TARGET. No custody, network permissions or activation changed.

Status: 2026-09-30. **CURRENT** names observed code/storage. **TARGET** names intended boundaries that may need implementation. The Agent aggregate is the product anchor, not an instruction to merge security domains or databases.

## Reviewed Launchpad scope, custody and remaining contracts

2026-10-01 continuing brief reconciliation. APPLIED means source changes present, REVIEWED means independent local evidence, UNVERIFIED means no browser/extension/production proof. Later sections with dated historical audits retain their original scope; this reconciliation supersedes outdated implementation claims. No runtime operation is authorized by this document.

**CURRENT:** launchpad_agent_scopes stores immutable agent_id/owner/version/kind/source/created_at separately from editable Agent JSON. Exact schema/sentinel/INSERT-UPDATE-DELETE guards establish authority; replacement/UPSERT cannot erase scope. Only valid initialized absence yields GENERAL; corrupt/missing authority is unavailable. Dedicated identity/entry requests are owner-bound and idempotent with separate fingerprints, atomic SQLite commit and synchronous operation guard. Explicit persisted GENERAL conversion is rejected instead of silently rewriting policy/history.

Associated-coin Paper authority requires exact confirmed canonical solana:101 receipt bound to Agent and owner; browser metadata, prepared mint and request targetPolicy cannot provide or downgrade authority. Configure, manual start and both tick paths recheck before and after awaited data. Entry policy/history revisions remain immutable. **REVIEWED152/152** is Paper/local proof, not Live coverage. TARGET all Real prepare/intent/confirm/autonomous/execution boundaries must eventually enforce the same associated mint without enabling Live or altering valid GENERAL authorization. Current continuation backend authorization is PAPER-only: Real enforcement implementation waits on an exact separately assigned contract; independent read-only coverage analysis is eligible.

**CURRENT custody unchanged:** owner authenticated wallet is checked as launch payer; browser obtains owner approval/signature through existing Pump flow and backend validates exact payer/message/signature/receipt. Agent Wallet is a separate optional encrypted server custody record, not a browser wallet or mint secret. Launch initial buy is distinct from later Agent funding and trading capital. On-chain creator is governed by existing builder/readiness evidence, not inferred from Agent Wallet, browser label or fee entitlement; any Guide display must read/verify that exact field before naming it. No custody/creator/fee-right changes authorized.

**TARGET relation:** owner -> permanent Agent ID -> optional Agent Wallet -> verified mint -> launch tx/status -> versioned strategy/mode, retaining independent custody/launch/Paper/Real stores. Immutable scope proves classification, not a complete relational Token aggregate nor historical receipt durability. No migration/backfill or cross-SQLite/JSON atomicity invented. Lost-response retry reuses the same intent key, signed uncertainty reconciles the same signature, never fresh submission.

**Trace to preserve:** sourced mint/network/freshness -> deterministic decision -> independent Risk -> separately authorized mode-specific execution -> confirmation/receipt -> position reconciliation -> provenance-labelled realized/unrealized accounting. Existing Paper simulation and Real confirmation pipelines are distinct; missing data/fees/deposits cannot become zero or synthetic PnL. Targeted coverage maps identify actual missing links before product changes. Public Home feed requires opt-in persisted publication and a strict read DTO, never owner /state reuse.


## Domain map

**2026-10-01 TARGET clarification:** Future launchpad target policy resolves the Agent's confirmed launch mint on the server, independently of browser/scanner mint input, and permits only SOL/WSOL↔associated mint. Preserve legacy general-bot policy through an explicit backward-compatible discriminator; do not silently apply this restriction to all Agents. One coin↔one launchpad Agent remains the packet's proposed v1 relation, requiring current-store/receipt audit before constraints or migration. Payer/creator/custody, fee allocation, funding and pause/open-position semantics remain unchanged pending their concrete contracts. No schema migration, receipt backfill or signer operation follows from this documentation update.

| Domain | Responsibility and owner | Current authority | Relationship |
| --- | --- | --- | --- |
| Agent Identity | Owner-bound stable ID, name, description, strategy | `agents` row + JSON `data` in SQLite | `agentId` root |
| Character | Visual/personality selection | Agent `character` / avatar fields | Optional presentation/configuration of Agent |
| Agent Wallet | Public address and encrypted custody | `agent_wallets` plus vault key, separate from `agents.secret` | Optional one-to-one via `agent_id` |
| Token | Draft metadata and eventual verified mint | **CURRENT:** embedded nullable `agent.coin`; confirmed launch receipt carries minted result | Optional Agent relationship; no independent relational aggregate yet |
| Launch | Mainnet Pump.fun Prepare, review, owner approval, submit, reconcile | Separate launch service and receipt/attempt journals | Bound to Agent ID + owner + token draft |
| Paper Trading | Simulated state, decisions, history and analytics | `paper_*` SQLite tables | Optional Agent capability; mode stays Paper |
| Real Execution | Funding/withdrawal, DEX intents, reservations, claims, receipts and positions | Separate wallet and DEX SQLite tables + on-chain reconciliation | Optional, separately authorized Agent capability |
| Market Data | External read-only discovery/quotes and provenance | Market/RPC adapters and snapshots | Inputs to decisions; not Agent identity |
| Activity | Owner-visible events and Paper decisions | `events`, `paper_history`, decision/DEX records | Derived by Agent ID; do not fabricate actions |
| Performance | Paper/verified Real metrics with provenance | Paper analytics and confirmed Real receipts | Explicit Paper vs Real labels |
| Owner/Auth | Wallet challenge, signature verification, session and ownership | `challenges`, `sessions`, owner column; HTTP-only cookie | Gates private Agent and value-moving actions |

## Relationship and lifecycle invariants

- Agent may exist without Token, Launch or Agent Wallet. `coin:null`, `launch:null`, `agents.secret=NULL` are valid Schema V2 identity-only states. UI/API reads must not dereference a missing token. A valid Agent ID must remain roster/detail-visible to its owner.
- Agent Wallet custody does **not** imply a token exists or has launched. `agents.secret` was a legacy Devnet mint secret, not the Agent Wallet vault key; never fabricate it for migrated identity-only Agents.
- Token draft is not minted token; prepared mint is not confirmed mint; failed Prepare is not on-chain launch failure. Only an independently verified confirmed receipt can mark launch success.
- Paper and Real have separate state, accounting and permissions. No Paper row can become Real merely by changing a label or copying history.
- Devnet history, mint secrets, labels and unresolved transactions cannot be promoted to Mainnet. Migration uses independent Mainnet genesis, finality and effect proof. `NOT_FOUND`, `UNKNOWN`, mixed or insufficient evidence stay archive-only. Historical proven records imported into `mainnet_migration_history` do not reopen active execution state.
- `UNKNOWN` signed/broadcast outcomes are never success and never proof of failure. Retain the signature/reservation and reconcile the same transaction; no blind retry.
- Every value-moving path requires current owner/session and Agent binding, valid Mainnet identity, fresh state, policy checks, exact intent/message/capability where applicable, and its own feature gate. Frontend rendering is not authorization.

## Trust and operation boundaries

| Operation | Boundary |
| --- | --- |
| View Agent, Paper, launch status, balances/market data | Read-only to chain; private data still owner-authenticated |
| Configure identity/token draft | Persistent off-chain write, not a chain transaction; **CURRENT** Mainnet Agent write middleware is restrictive |
| Prepare launch or Controlled Real review | May build/simulate and persist review state; must not sign/broadcast without separate authorization |
| Owner launch approval/submit, funding/withdrawal, Real DEX confirm | Transaction-producing; explicit owner authorization, exact binding, one submission claim, same-signature reconciliation |
| Autonomous trading | Independent scheduler/authorization, emergency stop and kill switches; not implied by Agent creation or launch |

## Storage and service boundaries

**CURRENT:** Browser SPA → same-origin Nginx routes → singleton API (`server/index.js`, port 4190) and singleton Pump launch service (`server/pump-launch-index.js`, port 4193). The API owns SQLite/WAL, auth, Agent, Paper, wallet transfer and DEX stores. Launch service owns separate receipt/attempt JSON journals and metadata publication. `DATA_DIR` and vault material must remain outside publicly served assets. `MAINNET_RPC_URL` stays server-side; one verified Mainnet RPC topology serves real-money phases. The checked-in PM2 manifest is an operational plan, not proof of live VPS state.

**TARGET:** A first-class Launchpad orchestrates the existing domain boundaries by Agent ID. It must not duplicate Pump transaction construction in the browser, move custody into Agent JSON, or make the UI the source of truth for network and lifecycle.

## Strategy Registry and revisions (TARGET)

Basis: [research](research/LAUNCH-STRATEGY-RESEARCH.md), [decision 083](decisions/083-strategy-foundation.md). Phase A implements a versioned read-only registry API and owner projections. The full revision store below remains a target contract, not an execution permission grant. CURRENT shared config/version and position snapshots are narrower than this target model.

| Entity | Fields and responsibilities |
| --- | --- |
| `StrategyArchetype` | `id`, immutable `version`, `name`, `description`, `behavior`, `supportedExecutionModes`, `entryModel`, `exitModel`, `riskSchema`, `parameterSchema`, `implementationStatus` |
| `Preset` | Stable `id`, `strategyArchetypeId` and pinned archetype version, `name`, `description`, typed `parameters`, `riskDefaults`, `timeHorizon`, `implementationStatus`; version presets to preserve default meaning |

Statuses: AVAILABLE / EXPERIMENTAL / PLANNED. Qualify implementation per mode separately from runtime availability and owner authorization. Product mode names PAPER / CONTROLLED_REAL / AUTONOMOUS_REAL map explicitly to existing runtime modes (including `LIVE_AUTONOMOUS`); no historical enum rewrite. AVAILABLE for Paper does not certify Real. Entry/exit models specify required data, timestamps/units, freshness, evaluation/reason IDs and deterministic behavior. Risk schema covers position sizing, max exposure, TP/SL, cooldown, budgets, horizon and stop conditions only where implemented. Parameter schema is server-owned, finite, typed and bounded; unsupported fields reject.

CURRENT maps one momentum/activity archetype to legacy profile IDs `selective` / `balanced` / `momentum`; the Phase A registry displays Strict / Standard / Broad as filtering presets, not independent algorithms. IDs/history are unchanged. Descriptive exposure now matches the effective 10% default/ceiling; differentiated exposure is not new policy. Trend/Recovery remain PLANNED until actual evaluator/data contracts/tests exist; further AVAILABLE promotion follows the PRD qualification criteria, never a cosmetic label change.

Conceptual pipeline: registry + preset → owner-validated configuration revision → immutable proposal → independent Risk → separately authorized existing execution port. Registry/configuration cannot sign, broadcast, activate Funding/Withdrawal/Live, bypass Mainnet or authorize execution. Token launch and Wallet funding are separate domains, not trading permission. No arbitrary executable code or prompt-generated rules enter the registry.

### Immutable configuration contract (TARGET)

Each proposal references `agentId`, `strategyRegistryVersion`, `configurationRevision`, `riskRevision`, `executionMode`, and pinned archetype/preset versions with a canonical configuration hash. Revisions are immutable owner-bound validated snapshots; edits create new revisions, not mutation of historical definitions. Retain referenced definitions for replay/explanation without value movement. Positions retain entry-time strategy/risk/exit policy; changing current Agent config cannot silently alter prior reviewed execution or position behavior. Runtime operational safety checks remain current and authoritative, even when a historical configuration is replayed.

CURRENT config/version snapshots provide partial support; separate registry/risk revision stores and complete proposal envelope are not yet implemented. Any future transition must preserve legacy records, mode/provenance and snapshots without fabricating missing historical revision values. No schema migration is performed here.

### Operating Plan projection (TARGET)

One server-derived owner projection summarizes `agentId`, registry/configuration/risk revisions, behavior/profile, actual supported entry/exit, configured capital and effective mode-specific ceilings, risk/stop conditions, mode and canonical status. Include source/version/freshness and unavailable reasons. Read the pinned saved revision plus independently derived current policy/availability; distinguish unsaved draft preview from saved authority. It is read-only and never an execution command. Do not infer permission from AVAILABLE, Working, a plan or frontend rendering.

Use validated config values, not competing marketing metadata. State explicitly fixed versus editable controls, valuation/percentage basis, units, fee/rent reserve and exit uncertainty; unavailable is not zero. Current Paper partial sells and Real full-position exits must not be misrepresented as identical. Private strategy details remain owner-only under existing publication rules; public generic archetype explanations contain no capabilities/preparations. Generating or replaying this projection must not rebuild/sign/broadcast or extend expiry.

## Known creation implementation gap

Current combined `POST /api/agents` still requires token name/ticker and creates a Devnet draft-mint secret; Mainnet middleware still blocks that path. Phase A adds separate owner-authenticated `POST /api/agent-identities` accepting only name/description/character/profile, persisting `coin:null`, `launch:null`, `secret:NULL` with immutable request fingerprint/idempotency. It creates no Wallet/Paper/launch/transaction. UI token setup and revised funnel remain future work. Fresh/V2 nullable schema is supported; legacy nullable upgrade is transaction-scoped on explicit identity write, preserves rows, indexes/triggers, FKs and sequence, and rejects unknown column layouts. No custody migration or production apply was run.

## Research-integrated read models (MVP TARGET)

See [decision 082](decisions/082-launchpad-product-foundation.md). These are projection contracts over existing authorities, not new services/tables/API endpoints already implemented. Owner-filtered `/api/state` must never be reused wholesale as public discovery. Independent identity, token draft, launch receipt and capability state remain authoritative in their own domains.

| Projection | Allowlisted content after explicit owner publication | Authority / constraints |
| --- | --- | --- |
| Public Agent | Stable ID, published name/description/character, linked verified token, capability availability and approved state summary | Identity + current capability policy; token optional; no private strategy/Wallet dump |
| Public Token | Verified mint/network/decimals and published metadata, Agent/launch references, sourced market values | Confirmed launch/token evidence; no prepared mint or draft promoted to live |
| Public Launch | Confirmed launch ID, Agent/token links, confirmation time/slot/signature and approved public metadata | Authoritative reconciled receipt; owner attempts/review not public |
| Market | Source, mint/pool/network, observed time/slot where available, freshness, coverage and verified/derived/unavailable values | Read-only adapters; external listing is not launch confirmation or execution eligibility |
| Public Activity | Allowlisted lifecycle summaries and separately approved activity with Paper/Real label | Canonical event references; no private diagnostic/preparation payloads |

Never publish custody ciphertext/secrets, private keys, vault material, RPC credentials/URLs containing keys, sessions/auth tokens, confirmation capabilities, owner-only unsigned transaction preparations/messages, internal Risk/validator dumps or sensitive diagnostics. Public addresses/transactions being on-chain does not grant permission to expose private application associations. Publish only explicitly approved fields; deny unknown/new fields by default. Owner read models retain authentication/ownership and their own least-privilege serialization.

Public projections cannot sign, fund, launch, start capabilities or change eligibility. They show source version/updated time and remain rebuildable from canonical records; missing/stale data is explicit. Publication controls must not erase canonical audit history.

## Lifecycle event contract (TARGET)

Events describe completed semantic transitions; they are not commands, UI-click logs or permission grants. Existing journals/tables do not yet constitute this unified model. Event envelope: stable event ID, type/version, aggregate ID, `agentId`, optional token/launch/attempt/capability ID, authoritative sequence/version, occurredAt, recordedAt, network/mode where applicable, evidence reference and visibility. Private payload is the default; public projection is separate. Never include secret/preparation/capability material.

| Event | Required meaning / evidence |
| --- | --- |
| AGENT_CREATED | Identity durably persisted; token/Wallet not implied |
| TOKEN_CONFIGURED | Validated token draft persisted; mint/launch not implied |
| LAUNCH_PREPARED | Complete current unsigned preparation persisted with required checks; owner-only |
| LAUNCH_AWAITING_APPROVAL | Existing valid preparation explicitly awaiting owner approval; not signed |
| LAUNCH_SUBMITTED | Existing submit/broadcast authority records submission; signature alone is not proof of landing |
| LAUNCH_CONFIRMED | Existing reconciliation verifies successful exact launch/receipt on Mainnet |
| LAUNCH_FAILED | Definitive failure with phase/attempt and evidence; pre-sign failure is distinct from failed chain transaction |
| LAUNCH_RECONCILIATION_REQUIRED | Outcome uncertain; same-signature reconciliation required, no retry authorization |
| AGENT_OPERATION_STARTED | Actual capability state transition authorized by its own policy; include capability and Paper/Real mode |
| AGENT_OPERATION_PAUSED | Actual capability pause recorded; open positions/outstanding transactions may still exist |

Expiry/review invalidation remains the existing preparation lifecycle and must never manufacture launch failure or revival. Events correlate to exact execution/attempt, so historical errors cannot override a different current review. Deduplicate authoritative transitions, preserve ordering per aggregate and tolerate duplicate delivery. Replay/projection must not trigger value movement. Canonical stores still decide current status/eligibility; pages consume the same derived model rather than independently infer state from event count or optimistic UI. Storage atomicity/reliable publication across SQLite and launch JSON journals requires a later implementation design; no cross-store transaction guarantee is invented here.

## Economic provenance contract (TARGET)

| Classification | Meaning | Required evidence |
| --- | --- | --- |
| ON-CHAIN VERIFIED | Exact chain effect verified under existing Mainnet reconciliation | Signature, network identity, slot/finality, account/mint binding, amount/decimals and effect reference |
| BACKEND VERIFIED | Persisted/validated application fact or sourced read validated by backend; not independently chain-proven | Source/version, timestamp, validation scope and network/mode |
| DERIVED | Computation over identified inputs | Formula/version, units, interval, input evidence/classification and coverage |
| UNAVAILABLE | Missing, stale, conflicting or insufficient evidence | Reason and last-observed time if known; never substituted zero |

Paper accounting can be backend-verified/derived but is never real on-chain profit. External market figures retain provider attribution; backend retrieval does not certify provider accuracy. PnL/ROI require explicit deposits/withdrawals, fees, realized/unrealized method and valuation window. Creator-fee revenue is not trading PnL; launch/network/rent costs and any future allocations have distinct categories. Market cap/volume/holders are not fabricated from mint existence. A verified input does not upgrade a derived metric into ON-CHAIN VERIFIED. Future creator economics require an approved authority/rights/accounting policy before implementation; no fee split, burns, rewards or token-holder entitlement is adopted.

## Receipt and provider boundaries - 2026-10-01

CURRENT receipt journal retains compact version2 public receipt maps with strict identity/owner/Mainnet/status/public-field validation and an 8 MiB bound. Cooperating writers use exclusive lock, baseline fingerprint, same-directory exclusive temporary file, file fsync/close, replacement and verified reread. Canonical state is adopted only after commit. External change or uncertain replacement fences the writer; abandoned locks are never cleared automatically. Windows directory fsync is unavailable, so power-loss durability is explicitly UNVERIFIED, not crash-proof. No signed bytes, mint secrets or private preparation evidence are persisted.

Pump records the one-shot intent before broadcast; restart/status/retry never rebroadcast. Signed reconciliation is serialized per Agent. Persistence acknowledgement describes a verified local commit only, not authorization or chain finality. Mainnet safety middleware admits only existing authenticated Paper configure/enable/pause/strategy-config POST routes; Real modes, wallet creation/balance mutation, funding and withdrawal remain excluded. Execution policy still independently checks immutable associated-mint scope.

The bundled Pump UI receives the canonical public-module signer as an explicit callback, avoiding a duplicate provider registry across static/bundled module identities. It captures the authenticated selected provider and Mainnet account, signs only, and rechecks binding after approval. Late owner/route/dialog changes stop presentation and polling. Metadata configuration/public hosting does not grant execution or custody permissions.
