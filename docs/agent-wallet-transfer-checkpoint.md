# Agent Funding + Withdrawal — implementation checkpoint

2026-09-27. **READY_FOR_REAL_FUNDING_TEST** means the implementation and mocked
checks are complete; it is not a claim that a real transfer has been tested.
No real funds moved, no Phantom prompt requested, no agent resumed.

| Area | Result |
| --- | --- |
| Agent wallet custody | Existing AES-GCM vault retained. Agent/address/key binding verified. Unavailable or inconsistent custody fails closed; derived signer bytes wiped. |
| Funding construction | Exactly one deterministic SystemProgram owner-to-agent transfer; no swap, Pump.fun instruction or arbitrary destination. |
| Funding validation | Auth, ownership, destination, amount, fee, balance, Mainnet genesis, fresh blockhash and complete message checked. Fresh server review occurs before the mocked Wallet Standard Mainnet sign-only boundary. |
| Funding receipts | CONFIRMED only after signature/message/effects verification; receipt includes agent, owner, wallet, lamports, signature, slot and timestamp. |
| Withdrawal | Separate amount review and explicit Confirm withdrawal; server signs only after revalidation and durable claim. |
| Withdrawal destination lock | Authenticated owner only; unexpected destination/body fields rejected. |
| Idempotency | Persistent per-agent keys, serialized SQLite reservations/claims, concurrent duplicate and restart tests pass. |
| Reconciliation | SUBMITTED/UNKNOWN reconcile the original signature; no automatic resend or replacement. Unverifiable outcomes remain locked. |
| Wallet activity | Dedicated real-SOL ledger/UI, separate from Paper positions/history. Balance unavailable is distinct from zero. |
| Feature flags | Live backend reports fundingEnabled=false, withdrawalEnabled=false, walletTransfersPaused=false. Transfer flags remain off. |
| Live Trading lock | liveTradingEnabled=false, globalTradingKillSwitch=true. No DEX executor added or trading started. |
| Desktop QA | 1440px production wallet component rendered with isolated injected transport. Funding review, withdrawal review/confirm, flags, missing wallet, API/balance errors checked. |
| Mobile QA | 390px production component; full addresses wrap, amount/fee/remaining and actions readable; no horizontal overflow. |
| Tests | 85 focused/regression tests pass (55 frozen Paper tests included), plus 16 backend/auth/chain/Mainnet-safety tests pass: 101 total. |
| Build | npm run build passes. Existing unrelated 571.62 kB phone-model chunk warning remains. |

## Runtime and preservation
Restarted only the verified TEKKWORK backend using existing `npm run server`.
Health responds at http://127.0.0.1:4190/api/health; current Node PID 14708.
Vite remains at http://127.0.0.1:5188, PID 25508; other Node services untouched.
The backend retains its existing legacy Devnet configuration. Wallet transfers
independently assert Mainnet; no RPC or deployment configuration was changed.
The health field broadcastEnabled still describes legacy Devnet issuance, not an
enabled funding/withdrawal permission.

Before/after hashes match for agents, paper_states, paper_history, paper_decisions,
agent_wallets, agent_funding, pump-agent-launches.json and the frozen source files:
Paper engine, discovery, scanner, Radar, strategy config, analytics and launch UI.
No real agent wallet or funding receipt was created. All Paper agents stayed paused.

## Evidence and limits
- artifacts/ui/wallet-withdrawal-1440.png
- artifacts/ui/wallet-withdrawal-390.png
- artifacts/ui/wallet-funding-390.png
- tests/wallet-transfers-fixture.html (isolated UI, not a real account)
- tests/wallet-transfers.test.mjs
- tests/wallet-funding-sign.test.mjs
- tests/wallet-auth-integration.test.mjs
- docs/decisions/034-owner-wallet-transfers.md (state machine/API/security rationale)

Authenticated session/ownership/origin middleware is tested in temporary databases.
Visual checks use production components with fixture balances, not the user's
authenticated account. Actual Phantom and Mainnet funding/withdrawal have NOT been
tested. A crash after the durable signing claim but before signature persistence
requires operator investigation; there is intentionally no automatic unlock.

The next phase requires separate authorization for exactly one tiny owner-to-agent
funding and one tiny agent-to-owner withdrawal. Do not enable flags or execute
either as part of this checkpoint.
