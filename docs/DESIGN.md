# TEKKTEAM design system and page composition

CURRENT 2026-10-01 direct QA retains original local font families, robot identity, shared wallet/dialog styling and ten destinations. Guest Agents/Market/Wallet now show owner-access/unavailable states instead of fabricated zeros. Actual1440/390 screenshots are in artifacts/launchpad-continuation/current-preview-qa; they qualify local guest layout only, not extension authentication, live data or production parity. No redesign or separate visual system.

Status: 2026-09-30. **CURRENT** tokens/patterns are observed in CSS/components; **TARGET** rules set one launchpad-first visual language. No page redesign is performed by this document.

## Continuing brief visual constraints and current acceptance

2026-10-01 continuing brief reconciliation. APPLIED means source changes present, REVIEWED means independent local evidence, UNVERIFIED means no browser/extension/production proof. Later sections with dated historical audits retain their original scope; this reconciliation supersedes outdated implementation claims. No runtime operation is authorized by this document.

Preserve current colors, robot, typography, cards, layout and sidebar identity. Ten destinations remain distinct; Launchpad prominent; Payroll unchanged. Exact Home primary CTA **Launch Coin + Agent** is APPLIED in overview.js, independently accepted in199-test integration; shared static/unavailable Home copy now APPLIED, awaiting narrow review. Original wallet chooser/dock/popover restored and independently accepted; do not redo/design a replacement. Public connection is visibly distinct from authenticated owner capability.

APPLIED/REVIEWED: Home launch positioning/sidebar, recovery shell, Launchpad owner pipeline/explicit identity-entry, Tokens inventory/detail and associated Paper controls. Former chooser-only statements below are dated audit history. Browser1440/390, real providers, focus/touch/back/overflow and screenshots remain UNVERIFIED. VM viewport numbers/source/build do not establish visual PASS.

TARGET additions use current rows/cards/status grammar: real published recent launches with associated Agent/status/activity or unavailable; complete coin+Agent review only when backend supports fields; draft/awaiting/submitted/confirmed/failed/reconciliation separate from operation status; Tokens receipt/transaction plus sourced metrics; Agent Wallet versus owner Wallet, Paper versus Live. Guide explains connect-launch-funding-start with actual payer/signer/creator and rules-based evaluator, retaining current layout. Disabled funding/Live never become normal enabled steps. No competitor UI copy or fresh research is needed for these bounded gaps.


## Direction

**2026-10-01 specification reconciliation (TARGET, not shipped):** Preserve ten distinct destinations: Home, Launchpad, Agents, Tokens, Market, Trading, Wallet, Leaderboard, Payroll, Guide. The supplied v1 packet's six-item menu is superseded by the latest explicit user decision; no removal or combination is authorized. Emphasize Launchpad in the sidebar and launch-coin entry as Home's primary CTA; general trading bots remain secondary. Preserve compatible existing hash routes and existing design tokens; packet blue-direction language does not authorize a palette or artwork reset. Browser QA covers 1280×720 and 1440 desktop, 390×844 mobile and 360px smoke. Source/static tests do not establish visual PASS.

TEKKTEAM should feel premium, technical, clean, purposeful, launchpad-first and crypto-native—not generic SaaS or an AI-generated collage. An Agent and its launch journey are the protagonists; trading is a capability. A viewer should identify the page's purpose, primary action and current state within three seconds.

**CURRENT strengths:** Home uses an authored office/character composition; `public/art-direction.css` provides dark surfaces, yellow action emphasis and a coherent compact grid; `public/world-directories.css` provides section headers, metric rails and Agent/Token card grammar. Launch UI already has review/prepare/approve steps and a payer/cost preflight. The Wallet workspace has an owner/Agent hierarchy.

**CURRENT debt:** `index.html` layers many stylesheets, including older `styles.css`/`workspace.css` and later route-specific overrides. Home, world-hero directories, Market panels, Wallet treasury and launch controls use overlapping but inconsistent visual grammars. `#/launch` is only an Agent chooser and the actual Pump flow is in Agent Detail. Repeating a large landing hero on every route weakens hierarchy. This is an audit, not permission to rewrite the site wholesale.

## Shared foundations

| Token | Current evidence | Target rule |
| --- | --- | --- |
| Grid | `--rail:216px`; shell desktop left padding rail + 36px; mobile reflow at 900px | One persistent navigation rail, one content grid; pages vary composition, not base geometry |
| Page width | Current shell has no global max-width | **TARGET:** cap primary reading/workflow region around 1200–1280px; allow intentional full-bleed art/market views only |
| Gutters | Current desktop 36px, mobile 18px in `art-direction.css` | Keep 32–36px desktop, 18–20px mobile; no arbitrary page offsets |
| Spacing | Current scale 4/8/12/16/24/32/48px | Use these tokens; section gaps 32–48px, card gaps 16–24px; denser data rows may use 8–12px |
| Radius | Current small 5px, medium 12px, some asymmetric panel corners | Standardize small 5px, panel 12px, CTA around 10px; specialized art exceptions documented |
| Color | Current canvas `#080f1c`, surfaces `#101e32`/`#17365b`, yellow `#ffda54`, blue accents, semantic positive/negative/warning | Yellow = primary action/selection, blue = navigation/info, green = verified success, red = loss/danger, amber = warning/uncertainty; never color alone |
| Surface | Existing soft-border dark panel and raised primary CTA | Canvas → section → panel → row; avoid panel nested inside panel inside panel |
| Typography | Current Lilita One display, Nunito Sans UI/body; older Outfit/Space Grotesk/Bungee also loaded | Lilita for deliberate headings only, Nunito for UI/body, monospace for addresses/hashes/metrics. Rationalize loaded legacy families during implementation, not now |
| Readability | Current micro-labels include 10–11px | **TARGET:** normal body 15–16px, secondary 14px, data/labels at least 12px; 10–11px only for rare noncritical decorative marks, never essential instructions |
| Controls | Current shared CTA/field/focus styles | Primary yellow, secondary blue/dark, tertiary text, danger low-emphasis until confirmation; 44–48px minimum touch target; visible keyboard focus |
| Icons | Current sidebar asset system and product icons coexist | One chosen family per context; official wallet/provider assets remain official; no emoji, random SVG mix or fake CSS illustrations where an asset is needed |

## Components and information hierarchy

Use one page header hierarchy: purposeful eyebrow (optional), clear title, one-line task explanation and at most one primary action. Section headings explain a decision or dataset, not decorate an empty card. Status badges describe lifecycle and include text, not just color. Metric rails show distinct measures once; no duplicated portfolio value. Rows are preferable to large cards for repeated activity/market results. Charts must show provenance, units, missing-data gaps and Paper/Real mode; never interpolate fabricated performance.

Empty states are first-class. `coin:null` shows **TOKEN NOT CONFIGURED**; unknown balances say unavailable, not zero; unconfirmed launches never display a “live token” or CA. Error screens preserve the surrounding page and provide an actionable safe next step. Any value-moving CTA is visibly separate from read-only review and repeats network, payer, amount and consequence.

## Page templates (TARGET; do not implement yet)

| Page | Composition and primary task |
| --- | --- |
| Home | One memorable “Launch an Agent. Launch its Coin. Put it to Work.” hero; primary LAUNCH AGENT, secondary EXPLORE LAUNCHPAD; recent verified launches; 01 Create / 02 Launch / 03 Operate; proof and ecosystem features. Trading appears as one capability, not hero identity. |
| Launchpad | Primary launch CTA; real recent launches and status; Agent/creator/token/Pump.fun relationships; clear not-configured, preparing, awaiting approval, submitted and confirmed states. Not another generic metric dashboard. |
| Agents | Owner roster with identity, character, strategy, token lifecycle and operating state. Identity-only Agents remain visible; filter/search must not require a token. |
| Agent Detail | Persistent Agent identity and state; token lifecycle and Launchpad entry prominent; Wallet, Paper/Real, Activity and Performance as subordinate sections. No nested unrelated dashboard heroes. |
| Tokens | Verified and draft token inventory with explicit state; identity-only Agents are not fake token cards. Market link only when supported by real mint/receipt. |
| Market | Provenance-labeled discovery/market information, concise dense rows and honest freshness; distinguish market-wide data from saved Agent scans. |
| Trading | Agent capability view: status, plan, open position, decisions and Risk; Paper vs Real unmistakable and safety state visible. |
| Wallet | Owner and Agent Wallet relationships, fresh balances, holdings and transfer history; deposit/withdraw use the existing authoritative flow, not duplicate custody UI. |

Leaderboard, Payroll and Guide should reuse the same type, surface, row, badge and spacing system; they are supporting destinations, not competing visual products.

## CREATE / DISCOVER / OPERATE compositions (MVP TARGET)

Research basis: [competitive research](research/LAUNCHPAD-COMPETITIVE-RESEARCH.md). Borrow comprehension principles, never competitor layouts, artwork, characters or copy. All three modes reuse the shared typography, robot identity, surfaces, spacing, inputs, buttons and responsive rules above; mode changes task density, not design system.

| Mode | Hierarchy | Desktop / mobile |
| --- | --- | --- |
| CREATE | Focused progressive identity → optional token → costs/permissions → valid review → explicit owner approval → canonical result | Constrained workflow with accessible summary; at 390px single-column steps and review/costs reachable without shrinking text |
| DISCOVER | One primary entry CTA, verified launches/Agent-token identities, meaningful state, source/freshness and compact market context | Scannable rows/intentional cards; mobile prioritizes identity/state/action, secondary metrics disclosed rather than card spam |
| OPERATE | Persistent Agent context, capability/mode/state, next legitimate action, position/Wallet/activity/results | Compact serious tools and shared metric rails; mobile prioritizes operational state/actions before secondary analytics |

CREATE distinguishes identity save, required funding, prepare, approval and confirmed result. Show actual payer, network, itemized initial buy/costs and consequence; never one ambiguous “go live” action. A resume flow returns to canonical state, not a fresh launch. Review invalidation/unknown outcomes have safe explicit next steps.

CURRENT 2026-10-02: identity fields use the existing shared form/review surfaces
with separate REVIEW AGENT IDENTITY and SAVE IDENTITY actions. Pending same-tab
recovery shows RETRY SAME IDENTITY SAVE with immutable original fields. Coin review
renders the chosen image. This source/API-reviewed increment preserves the design
language; actual authenticated human desktop/mobile acceptance remains unverified.

DISCOVER must not expose private drafts, review messages or diagnostics. A failed/empty dataset retains page structure and states unavailable/no launches rather than synthetic proof. A launched token and a paused Agent can coexist; do not collapse their badges. Public ranking separates Paper/Real, provenance and sample size. Market observation is not an executable trade recommendation.

OPERATE keeps Trading, Performance, Activity, Settings and Wallet subordinate to the same Agent context. Show only enabled capabilities; launch success cannot imply Live readiness. A paused/tokenless Agent remains legible and useful. Engineering controls stay secondary and owner-only.

Home combines launch/create entry with verified discovery and a persistent-unit story; avoid equal-weight heroes for each mode. Launchpad is creation + discovery + lifecycle. Public view and owner controls are visibly distinct, without forcing visitor wallet connection. Economics show provenance, units and unavailable states; never merge token price, creator revenue and Agent PnL.

Future implementation QA must cover transitions between modes, same-Agent links, private/public visibility, prepared/expired/unknown/confirmed branches, unavailable metrics and 1440px/390px keyboard/touch review. No visual implementation or browser QA is claimed in this documentation revision.

## Launch Strategy step (MVP TARGET)

Follow [decision 083](decisions/083-strategy-foundation.md) and [strategy research](research/LAUNCH-STRATEGY-RESEARCH.md), not competitor layouts/names. Same Home/Launchpad typography, surfaces, fields, buttons, spacing and responsive rules; no separate strategy design system.

Order: **BEHAVIOR → PRESET → OPERATING PLAN → CAPITAL / RISK → ADVANCED → REVIEW**. One available momentum/activity behavior initially; Strict / Standard / Broad are TARGET labels for legacy Selective / Balanced / Momentum filtering profiles. Do not expose Trend/Recovery as selectable; PLANNED information belongs in secondary roadmap content. Honest implementation/mode status and unavailable reasons are explicit. A risk label is not a loss probability or safety promise.

Operating Plan answers six questions in concise rows: What will it do? When does it consider entry? When does it attempt exit? How much capital can it use? What are its risk limits? When does it stop/pause? Values derive from actual saved configuration/effective policy; identify a draft preview separately. Show mode/status, fixed versus configurable rules, budget basis and exit uncertainty. Stop Loss is a trigger, not a guaranteed fill price; pause is not automatic liquidation.

Desktop: focused behavior/profile selection with compact plan summary, not ten tiny equal-weight cards or a dropdown of unexplained names. Mobile 390px: ordered single-column steps, readable plan/cost summary and large keyboard/touch-accessible controls. Advanced remains collapsed and uses shared disclosures/inputs. Expose only backend-supported entry/exit/size/exposure/TP/SL/cooldown controls; fixed current 15-minute hold is explanatory text, not a fake adjustable field.

Review separates strategy plan, trading allocation, initial token buy, launch/network/account costs and protected reserve; missing figures retain honest unavailable/pending labels. State that saving a strategy and launching/funding do not enable trading. No preselected permission, hidden auto-start or generic “go live” action. Tokenless/non-trading identity remains valid. Generic explanations may be public; private configurations/review stay owner-only.

Future QA: actual registry-derived choices and Operating Plan; same IDs/revisions across saved/reloaded plan; unavailable/experimental/planned modes; no unsupported controls; no authorization effect on selection/save; desktop 1440px and mobile 390px, keyboard, draft/empty/error states. This documentation change does not claim browser implementation QA.

## Shared quality and QA

No random tiny text, decorative label without purpose, excessive nested cards, arbitrary gradients, ubiquitous pills, duplicate metrics, compositional dead space, fake CSS illustration in place of needed artwork, or inconsistent icon families. Do not redesign each subpage as a separate product.

Before implementation, compare against actual Home/components and inspect desktop 1440px plus mobile 390px, keyboard focus, null/empty/error/unknown states and identity-only Agent. Browser QA must cover the page at initial, middle and end scroll—not only build success. This Phase 1 file defines direction; it does not assert that those QA checks were performed today.

## Baseline recovery evidence - 2026-10-01

CURRENT recovery preserves existing robot scene, palette, sidebar, ten destinations, card/modal classes and typographic families. Original Google Fonts Latin faces are now same-origin assets with hashes/OFL licenses; Home uses Lilita One and Nunito Sans again under the isolated CSP. Workforce access errors retain statistics, rankings, New hires, Trading Desk and Payroll composition with unavailable values instead of deleting the layout or inventing zeros. Launchpad and Agent Detail reuse the same Pump dialog.

Desktop1440/mobile390 guest screenshots are under artifacts/launchpad-continuation/current-preview-qa; mobile Home measured scrollWidth390 at viewport390. Browser screenshots prove this guest composition, not owner form/real wallet/public delivery or release parity. Public TEKKTEAM is the visual reference; BAGWORK is workflow research only. Its custody, fee/reward promises, free-market trading and visual assets are not adopted.
