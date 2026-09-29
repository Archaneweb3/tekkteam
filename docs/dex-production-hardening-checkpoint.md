# DEX production hardening — 2026-09-27

## Result and runtime

**NOT_READY:** complete production presigning value flow is not independently
proven. No real swap/signing/broadcast, funding, withdrawal or agent start occurred.

- Jupiter credential configured in ignored `.env`; official API returned HTTP200.
  Credential never returned to frontend. Startup fails closed with missing key
  or attempted execution enable. The chat-exposed key should be rotated by owner.
- Backend restarted with existing `npm run server`, PID **34832**, localhost
  `http://127.0.0.1:4190`; health OK.
- Funding=false, Withdrawal=false, Controlled Real=false, Live=false, kill=true.
- Legacy health network remains **devnet**, including its old devnet broadcast
  field. Wallet/DEX RPC Mainnet genesis verified independently; legacy configuration
  not changed or misrepresented as Mainnet.
- Exact credential scan: **629** source/build/test/docs/artifact files, **0 matches**.

## Real quote/build corpus

Three deliberate hypothetical production `/build` calls returned economic quotes
and instruction structures. No signer/send/simulation call. Samples are diagnostic,
not a future acceptance pair/amount choice. Provider labels are observations only.

| Sample | Hypothetical input | Observed labels/shape | Legacy / v0 diagnostic compilation | Result |
|---|---|---|---|---|
| 0 | 100,000 lamports SOL→USDC | Direct Deriverse | Fits / fits; 20 complete keys, 1 ALT | REJECTED: unverified V2 ABI/CPI |
| 1 | 200,000 lamports SOL→USDC | Split + multi-hop: 1DEX, Deriverse, Raydium, Stableswap, AlphaQ | Legacy oversized / v0 fits; 54 keys, 5 ALTs | REJECTED: shared V2 ABI/CPI; unsupported Token-2022 program |
| 2 | 10,000 base units USDC→SOL | Split Quantum, Meteora DLMM, StepN | Legacy oversized / v0 fits; 35 keys, 3 ALTs | REJECTED: V2 ABI/CPI; actual source ATA absent |

**Supported 0; rejected 3.** API returns instructions; legacy/v0 are local unsigned
diagnostic compilations, not two provider-returned serialized formats. A diagnostic
1,400,000 CU limit was added; this is not an approved executable budget. All
messages are historical and non-executable. Eight unique public ALTs captured.

Observed: direct, split/multi-hop, ALT, ATA creation, SOL funding/SyncNative/close,
Compute Budget price. Existing destination ATA was **not observed for this Agent**;
idempotent existing-ATA behavior is synthetic-test coverage only.

Evidence: `tests/fixtures/jupiter-production-corpus.json`,
`jupiter-alt-snapshots.json`, `jupiter-provenance-report.json`.

## Security status

| Area | Implemented/tested | Remaining boundary |
|---|---|---|
| Legacy/v0 + ALT | Complete RPC key expansion; Mainnet, owner, active/stable/index checks | Route semantics still unapproved |
| Account provenance | Derived Agent ATAs, classic token/mint state, RPC executable identity | 13/47/28 accounts per sample lack full authorization |
| ATA | Exact payer/owner/mint/derivation/program/privileges | Temporary/shared and unsupported Token-2022 forms reject |
| WSOL | Exact funding, sync, close to Agent; output ATA may follow sync | Setup helper does not authorize central route |
| Route decoding | Discriminators `bb64facc31c4af14`, `d19853937cfed8e9`; name candidates `route_v2`, `shared_accounts_route_v2` | Pinned full ABI and semantic decoding unresolved |
| CPI allowlist | Versioned `observed-v1-deny-all`; no CPI approved by observation | Pool/vault/PDA proof required for each permitted route |
| Writable/value flow | Unknown writable roles reject; fixture intent checks | Complete production presigning proof **NO** |
| Shared reservation | Atomic SQLite writer lock; FUND/withdrawal/DEX exclusion; UNKNOWN retention; terminal settlement | Future Live must integrate explicitly; not distributed across DBs |
| RPC reconciliation | Finalized exact message/signature/keys and actual SOL/token/fee/rent effects | Deterministic RPC metadata tests; production adapter remains unwired |
| BUY/SELL | Actual deltas/min-output/exact-input, isolated basis and partial SELL | No real swap executed |
| Failed transactions | Immutable failed receipt and fee expense, no position | Production route still blocked |
| Review UI | Fee/priority fee/peak ATA/reserve/available-after fields; unknown stays unavailable | No fake prepared cost or enabled execution |

Observed executable CPI addresses, **all unapproved**:

- `DRVSpZ2YUYYKgZP8XtLhAGtT1zYSCKzeHfb4DgRnrgqD`
- `ghosty4ZU1Qk1HN7Ymz4pZ15QfspzJZgSYFkdKN6ZLK`
- `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`
- `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8`
- `ALPHAQmeA7bjrVuccPsYPiCvsi428SNwte66Srvs4pHA`
- `DEXYosS6oEGvk8uCDayvwEZz4qEyDJRf9nFgYCaqPMTm`
- `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`
- `QuaNtZsgYRe5Z9Bk4LZ4cTD9tbkVoyCNf1R2BN9bBDv`
- `Dooar9JkhdZ7J3LHN3A7YCuoGRUggXhQaG4kijfLGU2j`

## Balance and reserve

Fresh finalized Mainnet reads at slot **450935757**, 2026-09-27 **07:56 UTC**:

- Agent `7Bt9Q3EciD8ZhoRA6CviqwpLpGhn4tscPrsKfUqGfFVe`: **0.004995 SOL**.
- Owner `ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS`: **0.107067872 SOL**.
- Both unchanged from verified round trip. Exactly one Agent Wallet; seven old
  wallet records, zero active requests; zero DEX executions/receipts/positions/
  expenses and zero reservations before/after restart.
- Old wallet ledger SHA256 unchanged:
  `9cacd17c08353de3d5949aafd10e05e841eca242c3832d9c6776b793d3c232f1`.

Protected reserve **2,020,000 lamports** = 2,000,000 safety + 10,000 future SELL +
10,000 reconciliation margin. Current fee and peak ATA costs are additional.
RPC rent is **1,488,440 lamports** per 165-byte account at this read, not a historic
hardcoded value. Both sampled BUY ATAs absent: peak **2,976,880**. Fee cap **10,000**.

`max(0, 4,995,000 - 2,020,000 - 2,976,880 - 10,000) = 0 lamports`.

**Maximum currently spendable: 0 SOL for this sampled two-ATA BUY shape**, before
the disabled route gate. Not a universal cost estimate for all pairs. WSOL refund
does not remove upfront rent. No future real amount selected.

## Verification

- Existing 222 tests retained; **272 total PASS**, zero failures/skips.
- **93 DEX tests PASS**, including **50 new** hardening cases.
- Independent SQLite worker-connection race admits exactly one operation.
  UNKNOWN blocks second spend, downgrade and unproven release; persistence rollback
  rolls back reservations; incoming funds never counted as spendable.
- Malicious ALT owner/state/index/replacement, wrong token/ATA mint/owner/program,
  frozen/delegated accounts, attacker WSOL close and extra transfers reject.
- Existing recipient/amount/input-output-mint/payer/signer/writable/budget/stale/
  idempotency cases remain passing. No broad allowlist added to pass real corpus.
- RPC BUY/SELL, rent refund, fee-only failure, metadata mutations, finalized slot
  and Mainnet checks pass offline. Failed fee receipt/expense immutable and idempotent.
- Build PASS; unrelated pre-existing phone chunk >500kB warning remains.
- UI **1440/390 PASS**, visually inspected, no horizontal overflow; fixture API
  only, prepare/confirm disabled. Screenshots: `artifacts/ui/dex-review-1440.png`,
  `dex-review-390.png`.
- Logs: `artifacts/ui/dex-hardening-all-tests.log`, `dex-hardening-focused.log`,
  `dex-hardening-build.log`.

## Every remaining blocker

1. Independently decode/pin actual V2 ABI, including input/output/max-input/
   min-output/authority/account semantics; discriminator matching is insufficient.
2. Audit a narrow CPI route and pool/vault/PDA roles, every writable account and
   executable program. Unsupported intermediate Token-2022 behavior stays denied.
3. Combine setup/cleanup, final-message RPC fee, peak/net rent, complete account
   proofs and route semantics into one reviewed production presigning adapter.
4. Then review exact-message custody, single-send persistence and actual RPC effects
   integration together. No production signer/broadcaster is installed; frozen
   transfer custody has not been widened.
5. Resolve controlled-test kill-switch policy only through explicit later authority;
   current kill cannot be bypassed. Recheck reserves for a user-selected future pair;
   this sampled shape has no spendable capacity.

Official API/ABI references:
[Jupiter build](https://developers.jup.ag/docs/swap/build),
[build API](https://developers.jup.ag/docs/api-reference/swap/build),
[older published CPI IDL](https://github.com/jup-ag/jupiter-cpi/blob/main/idl.json).
None substitutes for an audited decoder of the observed V2 routes.

NOT_READY
