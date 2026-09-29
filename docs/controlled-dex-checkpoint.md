# Controlled DEX implementation checkpoint — 2026-09-27

**NOT_READY for controlled Mainnet swap acceptance.** This is a tested isolated
scaffold and non-executable economic quote surface, not a complete real executor.

| Requested area | Verified result / boundary |
| --- | --- |
| Execution provider | Jupiter Swap V2 candidate; GET `https://api.jup.ag/swap/v2/build`. |
| Official/current API verified | Official build guide/reference read; ADR 039 records sources. No live provider quote was requested. |
| Quote layer | Implemented economic-only adapter; exact intent, bounded HTTP, direct ExactIn route, redacted failures. Server API key absent: actual UI reports QUOTE UNAVAILABLE. |
| Quote freshness | 15-second default TTL from request start; never silently replace reviewed economics. |
| Slippage | Canonical server max 100 bps; integer minimum-output bound and route fixture decoding. |
| SOL reserve | Fixture risk policy retains safety reserve + future SELL fee + actual network fee/rent separately. Actual RPC snapshot adapter not implemented. |
| ATA handling | Canonical classic-SPL output ATA instruction validation and exists/creation/rent risk fixtures. Actual mint/ATA RPC attestation and native wrapping/unwrapping not implemented. |
| Transaction validation | Legacy/v0 decoder, ALT resolution required, exact authority/message/amount/minimum/route accounts. Only independent server policy accepted. |
| Program allowlist | Exact Compute price/limit prefix, canonical optional ATA, one trusted decoded route. Production route registry empty; arbitrary System/SPL/unknown instructions rejected. |
| Message integrity | Final message bytes/hash persisted and verified before/after fixture signing and on finalized reconciliation. |
| Agent signing | Deterministic test keys only. Production custody signing integration deliberately not connected; frozen custody subsystem unchanged. |
| Broadcast | Fixture single-send claim/signature persistence/concurrency/unknown semantics tested. No production broadcaster wired. |
| Reconciliation | Fixture independent finalized-message/signature/effect checks; actual Mainnet effects extractor not implemented. |
| Real position ledger | New separate dex tables; immutable events/receipts, unique signatures, atomic confirmed-only position application. Production tables empty. |
| Real PnL isolation | Fixture weighted cost basis from actual input+fee; proportional SELL allocation; ATA rent separate. No Paper table writes. Failed-fee/rent-recovery portfolio accounting remains incomplete. |
| BUY fixture | Passed; no position before finalized reconciliation, duplicate confirmation cannot double apply. |
| SELL fixture | Passed; token/input/minimum/net SOL delta and realized cost basis verified using synthetic route. |
| Idempotency | Same key/same immutable intent returns existing; changed intent conflicts; explicit unsigned cancel permits new intent. No automatic retry. |
| Kill switches | Controlled Real false, Live false, global kill true, Funding/Withdrawal false; actual process verified after reload. |
| Controlled UI | Collapsed Agent Detail research surface, no chosen token/amount, explicit raw units, unavailable fees honest, prepare/confirm always disabled. |
| Security audit | Dedicated independent audit; five proven gaps fixed and regression-tested. See dex-security-audit.md. Production decoder/custody prerequisites remain blocking. |
| Tests | 43 DEX tests; complete Node suite 222 passed, 0 failed. UI 1440/390 fixture QA and six wallet-intent browser scenarios passed. Post-final health addition DEX+backend subset 52 passed. |
| Build | PASS. Existing 571.62 kB phone-model chunk warning remains unrelated. |

## Local runtime and preservation evidence

- Existing `npm run server` used; only TEKKWORK backend restarted. PID 31384,
  health OK at `http://127.0.0.1:4190/api/health`.
- `controlledRealEnabled=false`, `controlledRealRequested=false`, adapter
  `UNVERIFIED_ROUTE_ADAPTER`, Funding/Withdrawal false, Live locked, kill true.
- Existing health's legacy devnet field does not describe the isolated Mainnet
  wallet/quote network; the funding subsystem was not reconfigured.
- Wallet ledger byte-content SHA-256 unchanged before/after reload:
  `9cacd17c08353de3d5949aafd10e05e841eca242c3832d9c6776b793d3c232f1`.
- Seven wallet records retained; zero active wallet requests. Zero DEX executions,
  zero DEX receipts and zero DEX positions in the real database.
- Independent finalized Mainnet balances unchanged: Agent **0.004995 SOL**;
  Owner **0.107067872 SOL**.
- No Phantom, real signing, real swap, real transaction submission or autonomous
  agent action performed. No private key read by this implementation phase.
- `artifacts/ui/dex-review-1440.png` and `dex-review-390.png` show isolated mock QA,
  not a live executable quote or a real selected acceptance token.

## Explicitly still unverified / incomplete on Mainnet

Pinned narrow route ABI and CPI validation; pool/account/ALT provenance;
native SOL wrap/unwrap and account closing recipients; actual mint/ATA fee/rent
snapshot; production signer integration and shared wallet spending reservation;
production broadcast/recovery/finalized effects adapter; real position/PnL
acceptance; real provider API credentials/access. Neither BUY nor SELL has been
performed. Enabling flags alone cannot bypass the missing adapter gate.

See ADR 040 for contracts, accounting model, and implementation limits. No frozen
Paper or custody implementation was refactored. Stop here without a real swap.
