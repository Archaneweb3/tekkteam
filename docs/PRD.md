# TEKKTEAM product requirements

CURRENT 2026-10-02 owner-flow increment: explicit identity Review then Save, coin
image review, and owner-scoped same-tab retry after lost response/failed refresh
are applied and independently reviewed locally. Reload does not authorize a new
identity or silently repeat a POST. Saved coin metadata remains distinct from a
launched token. Actual human signMessage and browser Save/reload acceptance remain
UNVERIFIED; no production, funding, transaction or Live qualification is implied.

CURRENT 2026-10-01 scoped continuation: unsigned approval recovery is deliberate and requires expiry/mint absence; a saved draft still is not a launched coin. Guest inventory/treasury unknown values are unavailable, not zero. Public metadata origin preference tekkteam.tech is conditional on hosting qualification; no new publication authorized. See latest DELIVERY_PLAN ledger, not a claim that the entire launch/trading funnel is delivered.

Status: authoritative product direction, 2026-09-30. Labels mean **CURRENT** (verified in this repository), **TARGET** (agreed product contract, not necessarily built), and **PLANNED** (later candidate, not committed). This document does not authorize a transaction, feature flag change, or deployment.

## Continuing brief and accepted local baseline

2026-10-01 continuing brief reconciliation. APPLIED means source changes present, REVIEWED means independent local evidence, UNVERIFIED means no browser/extension/production proof. Later sections with dated historical audits retain their original scope; this reconciliation supersedes outdated implementation claims. No runtime operation is authorized by this document.

**TARGET primary journey:** connect owner wallet -> configure Pump.fun coin plus permanently associated Agent -> review actual costs/payer and approve separately -> reconcile verified mint -> separately configure/fund/start only authorized operation. Home primary CTA must be exactly **Launch Coin + Agent**; this exact copy is now APPLIED in the Home renderer, independently accepted in199-test integration; static/unavailable shell copy now APPLIED, awaiting narrow review. Ten destinations remain Home, Launchpad, Agents, Tokens, Market, Trading, Wallet, Leaderboard, Payroll, Guide. Payroll is unchanged. Identity-only Agents remain valid, and valid legacy GENERAL Agents retain general behavior.

**CURRENT APPLIED / REVIEWED:** launch-focused Home/sidebar; safe bootstrap recovery; dedicated Launchpad identity save/eligible scope entry; owner Tokens list/detail; immutable authoritative Launchpad scope and associated-coin Paper configure/start/tick enforcement. Independent integration152/152/build passed with issues. Original Phantom/Solflare/supported Solana MetaMask chooser/dock/connected menu restored and independently122/122/build accepted. Connection-only preview never authenticates, signs, requests balances or grants owner authority. Actual wallet extensions and browser1440/390 remain UNVERIFIED. No redesign/reimplementation of accepted wallet restoration.

**CURRENT gaps:** Home lacks public verified recent-coin feed; no publication store/API exists. Identity-only token setup is unavailable; existing combined creation remains Mainnet-blocked. Launchpad is now a real owner pipeline, not the former chooser, but full coin metadata/socials plus Agent strategy/risk review is TARGET. Shared read projector has no submitted state, so submitted/uncertain status requires contract work, not optimistic success. Tokens does not yet display the full verified receipt/transaction and sourced market context. Guide remains trading-first. Existing Paper proof does not qualify Live target enforcement.

**Acceptance:** Home real coins with linked Agent/status/activity or honest unavailable; Launchpad image/name/ticker/description/socials, Agent name/versioned strategy/effective risk, actual fees/wallet before separate approval, draft/awaiting/submitted/confirmed/failed/reconciliation states; Tokens verified mint/receipt/tx/Agent plus only sourced market data and safe uncertain recovery; Agent Detail coin/Agent Wallet/capital/positions/history/mode/authorized Start/Pause; Wallet owner versus Agent, truthful balances/funding/history; Leaderboard separate Paper/Live; Guide connect-launch-funding-start and payer/signer/creator. No invented AI behavior: current trading evaluator is deterministic rules-based momentum/activity. Funding and Live remain OFF; explaining a future step is not enabling it.


## Product

**TEKKTEAM is an AI Agent Launchpad.** Its primary promise is to let a creator give an Agent an identity, configure it, create and launch an associated token with explicit wallet approval, and then follow that Agent-and-token unit's activity and economy. Trading is one Agent capability, not the product's identity. No copy may imply guaranteed profit, guaranteed launch, or autonomous Mainnet trading that has not been enabled.

The relationship anchor is `agentId`. Agent identity, token, Agent Wallet, Pump.fun launch, Paper state, and Real execution have separate lifecycles. An Agent with `coin: null` is valid and must render **TOKEN NOT CONFIGURED**, never a fabricated mint or a blank page.

## Users and journeys

| User | Primary need | Authorization boundary |
| --- | --- | --- |
| Creator/owner | Create and configure Agents, prepare a launch, approve wallet actions, inspect wallet and results | Owner-wallet challenge/session; explicit approval for value movement |
| Returning operator | Resume inspection, reconcile launch/transfer/execution outcomes, pause safely | Same owner binding; uncertain outcomes must be reconciled, not retried blindly |
| Visitor | Discover Agents, tokens, market and product mechanics | Public surfaces only; no private Agent controls |

**TARGET core loop:** DISCOVER → CREATE / CONFIGURE AGENT → CONFIGURE OPTIONAL TOKEN → REVIEW COSTS / FUND ONLY WHERE REQUIRED → PREPARE PUMP.FUN LAUNCH → EXPLICIT OWNER APPROVAL → RECONCILE CONFIRMED LAUNCH → OPERATE AVAILABLE, SEPARATELY AUTHORIZED CAPABILITIES → TRACK / SHARE PUBLIC-SAFE ACTIVITY → DISCOVER AGAIN. Tokenless Agents can enter Operate without launching. Failed/expired/uncertain launches branch into truthful recovery/status, never automatic relaunch. Funding is not a prerequisite for identity creation.

**TARGET information architecture:** Home, Launchpad, Agents, Tokens, Market, Trading, Wallet, Leaderboard, Payroll and Guide are ten separate destinations with distinct jobs. Home retains `#/overview`; Launchpad is first-class. Never combine Market with Trading or Wallet with Leaderboard. The exact route/job mapping is authoritative in `LAUNCHPAD-IMPLEMENTATION.md` section 2; Pump.fun launch must not be hidden inside Settings.

**Lifecycle authorization contract:** Agent Identity != Token != Agent Wallet != Trading Engine. An identity-only Agent with `coin:null` remains a first-class Agent; do not fabricate a token, mint or placeholder success. Token configuration does not authorize launch; launch does not authorize trading; funding does not authorize execution. Paper and Real remain separate. These clarify the independent lifecycles below, not a new runtime capability.

**CURRENT:** `#/agents/new` collects Agent and required token name/ticker in one wizard; `POST /api/agents` creates a Devnet draft-mint secret. The Mainnet API safety middleware blocks general Agent POST. `#/launch` is an Agent chooser, while the actual Pump.fun form is opened from Agent Detail. Pump preparation, owner approval/submit, and status/reconciliation are separate operations. Read-only migrated Schema V2 Agents can have `coin: null`, but new creation is not yet decoupled. Evidence: `public/app/workspace.js`, `server/app.js`, `src/pump-launch-ui.js`, `server/pump-launch.js`.

## Launchpad funnel

The following is **TARGET**, not a claim that the whole funnel ships today.

| Step | Owner sees | Required boundary |
| --- | --- | --- |
| 01 Character | Character identity and preview | No token or wallet required merely to view |
| 02 Agent | Name, personality/description, strategy | Save identity independently of token |
| 03 Token | Name, ticker, image, description | Token draft belongs to `agentId`; no invented mint |
| 04 Launch | Pump.fun configuration, optional initial buy if supported, cost and risk review | Fresh Mainnet readiness; prepare is not signing |
| 05 Wallet approval | Exact payer, message and costs | Manual owner action; no automatic signature/broadcast |
| 06 Live unit | Confirmed Agent, token, mint, market and Wallet relationships | Show “launched” only after authoritative confirmation |
| 07 Operate | Paper, controlled or Real capabilities and results | Each capability retains its independent kill switch and permission |

## Independent lifecycles

- **Agent (TARGET):** identity created → configured → paused/operating per capability → archived only under an explicit safe lifecycle. Identity exists with no token, launch or Agent Wallet. **CURRENT:** JSON `agents.data` contains identity plus embedded `coin`, and migrated identity-only rows have `coin:null`, `launch:null`, `secret:NULL`.
- **Token (TARGET):** not configured → draft configured → launch associated → verified on-chain token. The token relationship is optional. **CURRENT:** token draft is embedded in `agent.coin`; there is no standalone Token aggregate/table. Never infer token existence from an Agent Wallet or a prepared mint.
- **Agent Wallet (CURRENT):** optional per-Agent custody record in `agent_wallets`, with a separately encrypted secret and public address. Creating Agent identity does not prove a Wallet exists. Funding/Withdrawal are separately gated, owner-bound flows. **TARGET:** Wallet status is shown in the Agent ecosystem without coupling it to launch.
- **Paper (CURRENT):** separate `paper_states`, history, decisions and portfolio history. It is simulated and pauses on restart. **TARGET:** clearly subordinate to Agent operation, never presented as Mainnet value movement.
- **Real trading (CURRENT):** separate execution/receipt/position ledger and explicit authorization gates; ordinary Live remains fail-closed in the present runtime. **TARGET:** only exposed when independently reviewed and enabled. Paper state must never silently become Real state.
- **Pump.fun (CURRENT):** separate Mainnet launch service and receipt/attempt journals. Prepare, owner wallet approval, submit and reconciliation are distinct; a signature with uncertain outcome blocks fresh launch until resolved. **TARGET:** same safety path becomes the primary Launchpad journey, not a hidden Settings feature.

## Product states and visible language

These are **TARGET canonical UI states**. Map them from authoritative Agent, token, launch receipt and attempt data; do not fabricate a unified backend enum or conflate receipt with a failed Prepare attempt.

| State | User-visible presentation | Current support |
| --- | --- | --- |
| `AGENT_CREATED_TOKEN_NOT_CONFIGURED` | Agent card/detail visible; “TOKEN NOT CONFIGURED”; token CTA may start setup | Migrated identity-only Agent exists; general create journey not yet separate |
| `TOKEN_CONFIGURED_NOT_LAUNCHED` | Token draft details; “NOT LAUNCHED”; no CA or market link | Embedded `coin` draft / idle launch status |
| `LAUNCH_PREPARED` | Review exact Mainnet payer, transaction, initial buy, fees and expiry | Pump prepare path exists; not a transaction confirmation |
| `AWAITING_OWNER_APPROVAL` | Explicit wallet approval action; no auto-submit | Separate client approval/submit path exists |
| `LAUNCH_SUBMITTED` | Pending signature and status; no duplicate submission | Receipt/reconciliation path exists |
| `LAUNCH_CONFIRMED` | Mint/CA and Pump.fun link only after verified confirmed receipt | Confirmed receipt gate exists |
| `LAUNCH_FAILED` | Definitive failure, stage and safe retry guidance only when proven safe | Attempt/receipt diagnostics exist; never erase history |
| `LAUNCH_RECONCILIATION_REQUIRED` | Uncertain signed/broadcast outcome; check same signature; disable new launch | Existing status policy treats null RPC status as insufficient proof of failure |

For every state, missing data must be shown as unavailable/not configured, not zero, “launched”, or a synthetic record. A historical failed preparation does not equal a failed on-chain launch.

## Strategy product contract

Basis: [strategy research](research/LAUNCH-STRATEGY-RESEARCH.md) and [decision 083](decisions/083-strategy-foundation.md). CURRENT is repository evidence, not production activation. Registry and Launch strategy-step changes below are MVP TARGET, not shipped features.

| Term | Meaning |
| --- | --- |
| Strategy archetype | Underlying trading/operating algorithm; current momentum/activity engine |
| Preset / profile | Curated parameters for an archetype; not an independent algorithm |
| Risk configuration | Sizing, exposure, budgets, limits and stop conditions enforced independently |
| Execution mode | PAPER, CONTROLLED_REAL, AUTONOMOUS_REAL; each has separate qualification/availability |
| Execution authorization | Explicit owner/policy/runtime gates required for the particular action; not configuration |

**CURRENT:** Selective, Balanced and Momentum are three presets over the same deterministic positive-momentum/activity evaluator. All entry filters must pass. Defaults below come from `public/app/strategy-config.js`, not marketing metadata.

| Preset / runtime ID | 5m change band | Buy:sell ratio | Minimum 5m volume / liquidity | TP / SL | TARGET filtering label |
| --- | --- | --- | --- | --- | --- |
| Selective / `selective` | 0.5–5% | 1.5 | $1,000 / $25,000 | +5% / −3% | Strict |
| Balanced / `balanced` | 0.75–10% | 1.25 | $750 / $15,000 | +6% / −3.5% | Standard |
| Momentum / `momentum` | 1–20% | 1.1 | $500 / $10,000 | +8% / −4% | Broad |

Mapping describes stronger activity/liquidity filters and narrower upper momentum bounds, not uniformly higher thresholds or guaranteed lower risk. IDs and historical records remain unchanged. All defaults currently share 0.001 SOL Paper trade cap, 10% of starting Paper capital position cap, one open position, 0.02 SOL daily turnover including fees, 60-second cooldown, 100 bps slippage and 15-minute hold. TP/SL/hold are exit triggers subject to execution/Risk checks, not guaranteed fill prices or liquidation deadlines. Paper and Real sizing/exit envelopes differ; never copy Paper limits into Real authorization.

**Unresolved implementation issue:** `server/config.js` exposure metadata is 5/10/15%; active config defaults to 10% for all and permits at most 10%. The intended future differentiated exposure is not established. Document effective validated values; do not invent intent, raise a ceiling or silently change the engine. Smaller Selective sizing is not currently implemented by its default.

**MVP TARGET Launch Strategy step:** BEHAVIOR → PRESET → OPERATING PLAN → CAPITAL / RISK → ADVANCED → REVIEW. Present one Momentum/activity behavior with the three mapped profiles, not fake algorithm diversity. The optional operating plan belongs after identity and before final review; a tokenless or non-trading Agent remains valid. Explain what the Agent does, when it considers entry, when it attempts exit, how much capital it can use, its limits and when it pauses/stops. No wall of unexplained cards or technical parameters. Advanced discloses only supported controls.

**Custom:** typed, bounded, validated parameters within an implemented archetype. Current controls cover minimum liquidity/volume/momentum, size/position/daily limits, TP/SL, cooldown/slippage. Current upper momentum band and buy:sell ratio remain preset-bound; hold remains fixed at 15 minutes, maximum open positions fixed at one. No unsupported time-horizon, trailing-stop or multi-position editor. No arbitrary code or prompt-controlled trading.

**PLANNED:** Trend and Recovery, not selectable working Launch options. PLANNED → EXPERIMENTAL requires actual distinct evaluator, typed data/parameter contracts, ordered history/coverage and deterministic no-lookahead/failure tests. EXPERIMENTAL → AVAILABLE requires reproducible Paper qualification, reviewed Risk/sizing/exits, restart/history compatibility, explainable UI and explicit per-mode safety evidence. Real availability needs independent network/venue/custody/validator/simulation/reconciliation qualification and authorization. Status is not a trading gate; no profitability promise follows.

Operating Plan is an owner read-only projection of actual configuration: behavior, profile, supported entry/exit rules, configured/effective capital limits and risk, execution mode and canonical status. Include configuration version, policy bounds and unavailable reasons; show Paper/Real explicitly. Full contract is in ARCHITECTURE. Do not fabricate rules from a profile name or expose private plan details through public discovery without approved allowlisting.

Authorization invariants: **CONFIGURE STRATEGY ≠ ENABLE TRADING; CONFIGURE TOKEN ≠ LAUNCH TOKEN; LAUNCH TOKEN ≠ ENABLE AGENT TRADING; FUND AGENT WALLET ≠ AUTHORIZE EXECUTION.** Each capability retains existing owner, network, Risk, custody, preparation, expiry, claim, kill-switch and reconciliation gates. Saving/reviewing a plan has no automatic signing/broadcast/start effect. Launch initial buy, operating allocation and fees/reserves are distinct costs.

Future acceptance checks: correct same-engine wording/mapping; no unsupported selectable archetype/control; catalog/effective-limit consistency; actual configuration-derived Operating Plan; configuration saves cannot grant execution permissions; edits cannot reinterpret prior positions/proposals. No runtime implementation is authorized by this contract.

## Scope and roadmap

**MVP TARGET:** independent Agent identity; token setup; a first-class Launchpad entry and clear lifecycle; reuse the existing manually approved Pump.fun flow; owner/Agent Wallet visibility; Paper operation and honest activity/performance; safe empty/error/reconciliation states; desktop/mobile parity.

**POST-MVP PLANNED:** richer market discovery and provenance-backed Signals; additional Agent capabilities and economic reporting only when backed by verified data and safety review. Basic verified launch discovery is MVP TARGET, not deferred entirely until post-MVP.

## Research-integrated product contract

Basis: [competitive research](research/LAUNCHPAD-COMPETITIVE-RESEARCH.md) and [decision 082](decisions/082-launchpad-product-foundation.md). Research supplies principles, not competitor UI, custody semantics or economic promises. The following is TARGET; none of these additions claims implementation.

### Three modes, one product

| Mode | Job | Shared relationship / boundary |
| --- | --- | --- |
| CREATE | Agent identity, optional token configuration, required Wallet/funding review, launch preparation, owner approval and result | Preserve `agentId`; separate identity write, funding, prepare and value movement |
| DISCOVER | Verified launches, public Agents/tokens and provenance-labeled market context | Public allowlisted projections, not owner session data; future Signals remain optional |
| OPERATE | Agent Detail, Wallet, Trading, Performance, Activity and Settings | Authenticated ownership for private controls; separate capability permissions |

These modes share navigation, identity links, lifecycle vocabulary and components. They do not require three applications or merged domain state. Launchpad combines creation + discovery + lifecycle, not merely a token form.

### Journeys and post-launch return

- **Creator (MVP TARGET):** explore → create identity → configure optional token → inspect actual payer/costs and permissions → approve launch through existing flow → inspect authoritative result → open persistent Agent/token destination. Review separately identifies initial buy, launch/network/account costs and any independently required trading capital. Do not change current owner-payer semantics to imitate competitors.
- **Visitor (MVP TARGET):** browse published, verified launches → inspect linked Agent/token and market context → inspect public-safe activity → return or choose Create. Browsing public data must not require wallet connection. Private drafts/preparations stay owner-only.
- **Returning owner (MVP TARGET):** resume the canonical Agent/launch state, reconcile the same uncertain signature, inspect balances/activity, configure or pause authorized capabilities. Never restart a pending launch from a discovery card.
- **Post-launch (MVP TARGET):** confirmed mint/receipt → persistent linked destination → actual activity and market context → owner operational action or public discovery. Launch is not the end of the funnel and is not trading activation.

**MVP utility while Live remains closed:** launch/status inspection, linked Agent identity and token information, Wallet visibility for the owner, and existing Paper testing/decision/performance history with explicit simulated labels. Publish only actual supported data. No voice host, automatic trading, fee reinvestment, rewards, burns or support-buy promise is adopted. A paused Agent remains useful; do not fabricate activity to make it appear alive.

**Return loop:** discover new verified units → inspect changes and actual reasons/results → owner resumes safe operation or visitor explores related units → discover again. Creator revenue is not required for this loop and must not be invented.

### Discovery scope and access

| Destination | MVP TARGET public scope | Owner-only scope |
| --- | --- | --- |
| Launchpad | Published confirmed launches, creator-approved identity/metadata and verified result; honest empty state | Drafts, costs/preparation/review/approval, pending/failed/uncertain attempt details and recovery |
| Agents | Published identity, character, available capability summary and explicitly published operation state | Full strategy configuration, controls, private Wallet/history, preparations |
| Tokens | Verified minted assets linked to Agent/launch; provenance-labeled market values | Token drafts/configuration and unpublished relationships |
| Market | Read-only external market context with source/freshness/coverage | Private saved scans and owner-specific decisions unless sanitized publication is approved |

Public publication is an explicit owner opt-in, not inferred from an on-chain transaction or public wallet address. Use a deny-by-default allowlist. A published confirmed mint can be retained as factual history even if current operation is paused; application publication/withdrawal policy needs implementation review. Do not imply an Agent's token grants rights to custody, trading profit or fees.

Home leads with launch/create and verified ecosystem activity, with Agents as the ongoing utility bridge. It must not give trading, market, coins and future Signals equal competing hero priorities. Tokens describes assets; Agents describes operators; Market describes external context; Launchpad coordinates entry and lifecycle.

### Calls / Signals decision

**CURRENT:** decisions and saved scans exist; there is no verified standalone public Signals pipeline. **MVP:** no Calls page; use actual lifecycle/activity where supported. **POST-MVP PLANNED:** provenance-backed Agent Signals, conditional on a durable data contract and privacy review, not a committed launch requirement.

A future signal is created by the server from a genuine timestamped Agent/market observation, not client-generated marketing. It carries signal ID, Agent association if applicable, mint, source/type, observed time/slot, reason, market baseline and fresh/current/peak values only where available, with methodology. Market is a current dataset; a signal is a historical observation; a trade is a separately authorized execution/receipt. Rejected proposals are not executed trades. Community submissions require separately scoped moderation/scoring and are not included by default. No guaranteed profit, attainable peak fill or realized-PnL claim follows from a signal.

### Economics and acceptance criteria

Use the provenance contract in ARCHITECTURE: ON-CHAIN VERIFIED, BACKEND VERIFIED, DERIVED or UNAVAILABLE. Creator fees, token price/mcap/volume/holders, deposits, launch costs and trading PnL/ROI remain separate. No fee policy, token-holder entitlement or creator-income feature is invented.

MVP acceptance: identity-only Agent visible; draft cannot appear launched; confirmed launch links to the same Agent/token; owner review stays private; public data is opt-in/allowlisted; missing metrics remain unavailable; Paper/Real provenance visible; launch cannot grant trading permission; failed/unknown lifecycle resumable without blind retry. All are future implementation checks, not tests passed by this document.

**NON-GOALS:** trading-bot-first homepage; fabricated tokens/mints/returns; automatic signing, broadcast or retry; bypassing Mainnet, custody, Risk, expiry or kill-switch rules; rewriting historical provenance; redesigning or activating these systems in this documentation phase.

## Direct delivery implementation - 2026-10-01

CURRENT local source: owner immutable coin draft save/reload/exact retry; shared Pump review/status modal reachable from Launchpad and Agent Detail; explicit selected Solana provider bridge for transaction-only approval; per-Agent associated-mint Paper enforcement and authenticated Mainnet Paper configure/start/pause. Legacy GENERAL Agents remain valid. Receipt journal repair persists before adoption/broadcast and fences uncertain writes; a backend persistence acknowledgement is not chain confirmation.

TARGET qualification: actual public metadata/image delivery, real extension owner authentication/manual approval, and associated-token Real venue support. Funding/withdrawal/Live remain OFF. Current owner-payer/encoded creator and optional separately provisioned server-custodied Agent Wallet are unchanged; identity or launch does not create, fund or authorize that wallet. Anonymous latest-coin discovery still requires a durable opt-in/revoke privacy contract; no owner data is republished to fill Home.
