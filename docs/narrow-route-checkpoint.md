# Jupiter narrow route proof — 2026-09-27

## Result

**NOT_READY.** One real route's top-level serialization is now decoded, but full
CPI behavior, every writable role and minimum-output enforcement are not proved.
Production adapter remains disconnected; all execution gates remain disabled.

## Rejected sample analysis / structural execution graphs

Complete machine-readable graphs are in `artifacts/ui/narrow-route-graphs.json`:
every static/resolved key with index and signer/writable flags, ALT indexes, ordered
instructions with data bytes/account indices, observed underlying executables,
token accounts, ATA derivations, wrap/close flows and Compute Budget values.
See also `docs/narrow-route-value-evidence.md` and `narrow-route-abi-evidence.md`.

| Sample | Versions | Static + ALT keys (v0) | Writable / unproved roles | Instructions | Why rejected |
|---|---|---|---|---|---|
| 0 direct Deriverse BUY | legacy and v0, equivalent resolved instruction graphs | 9 + 11 | 11 / 8 | 8 | CPI schema/roles and minimum-output behavior unproved |
| 1 shared/split multi-hop BUY | v0; legacy oversized | 14 + 40 | 30 / 27 | 8 | Multiple unaudited CPI programs, shared route, Token-2022; outside narrow policy |
| 2 split SELL | v0; legacy oversized | 12 + 23 | 18 / 15 | 5 | Multiple unaudited CPI programs; source token ATA absent; outside narrow policy |

Every sample has sole Agent signer/fee payer and zero signatures. Samples 0/1:
Compute limit → Compute price → WSOL ATA → System wrap → SyncNative → target ATA
→ Jupiter route → WSOL close to Agent. Sample 2: Compute limit → Compute price →
WSOL ATA → Jupiter route → WSOL close to Agent. Limits are the previous diagnostic
compiler's 1,400,000 units, not an approved future execution budget. Sample prices
are respectively 831 / 771 / 831 micro-lamports per CU.

Expected flows, explicitly distinguishing proof gaps:

```text
Sample 0: Agent --100000 lamports (decoded)--> derived WSOL ATA
          --[Jupiter / Deriverse CPI UNPROVEN]--> derived Agent USDC ATA
          WSOL close names Agent as return destination

Sample 1: Agent --200000 lamports (decoded)--> derived WSOL ATA
          --[shared/split/multi-hop CPI UNPROVEN]--> derived Agent USDC ATA
          WSOL close names Agent as return destination

Sample 2: intended Agent USDC ATA (currently absent)
          --[split CPI UNPROVEN]--> derived WSOL ATA --close--> Agent
```

Quoted outputs are not actual/proven delivered outputs. Top-level structure does
not exclude hidden CPI recipients, authority changes or extra debits.

## Selected candidate and proof gained

**Candidate only:** sample 0, classic SPL SOL/WSOL→USDC, one Deriverse leg, one ALT.
No route has been selected as executable or safe.

The current [on-chain IDL retrieval service](https://idl.solana.com/docs) exposed
Jupiter's Anchor schema. We independently derived its account and fetched it from
Mainnet RPC, owned by Jupiter; decompression reproduced exact raw SHA256
`cf5b1abb503ba25caf3423a89e29c7aa127c44867fabe6a22e143c554d813b7d`.
Public bytes and proof are retained in `tests/fixtures/jupiter-v2-idl-rpc-proof.json`.

`jupiter-deriverse-observation-v1` decodes all 44 bytes:

- in amount **100000**, quoted output **12224**, slippage **100 bps**;
- platform and positive-slippage fee fields **0**;
- one Deriverse enum **161**, side **1**, instrument **0**;
- allocation **10000 bps**, input index **0**, output index **1**;
- ten top-level roles checked, including independently derived Agent source and
  destination ATAs, both classic token programs, optional destination sentinel,
  event authority and router. No trailing bytes accepted.

This proves serialization/declared fields, **not maximum executable debit or
guaranteed output**. For 12224 at 99%, floor is 12101 versus the provider threshold
12102. No on-chain rounding assumption was encoded to make the sample pass.

## Downstream / CPI / writable proof

The [pinned official Deriverse SDK](https://github.com/deriverse/kit/tree/5f17de893332d76fd04a01bc4a3fa9a4ed3581b5)
corroborates `DRVSpZ2YUYYKgZP8XtLhAGtT1zYSCKzeHfb4DgRnrgqD` and direct swap
construction, but does not establish Jupiter's current adapter implementation.
Its classic direct constructor suffix differs from the captured CPI-looking slice.
No padding/reordering/normalization is performed to hide that difference.

Eight writable roles remain unproved: two apparent protocol token vaults and six
instrument/orderbook context accounts. Full addresses and candidate role names are
in the ABI evidence document. Program ownership and matching token mints alone do
not prove the correct pool, PDA authority, allowed fees or all possible recipients.

Both router and downstream program are upgradeable. Historical ProgramData hashes,
deployment slots and authorities are recorded in `narrow-route-chain-evidence.json`;
these are not approved code hashes. No source-to-current-binary equivalence claimed.

ALT: fully resolved historical keys and existing RPC checks retained.
ATA: canonical derivation and structural lifecycle checks retained.
WSOL: exact wrap/sync/close-to-Agent checks retained.
Complete value-flow proof: **NO**. Approved CPI allowlist: **empty**.

## Sampling, mutations and integration

- Existing real dry-run samples examined: **3**. Supported **0**, rejected **3**.
- New samples: **0**. No supported narrow policy exists yet; conditional follow-up
  sampling was not triggered, and no transaction was modified to pass.
- Narrow decoder mutations reject changed input/quote/slippage/fees, route shape,
  router and all ten top-level account roles; trailing/noncanonical bytes reject.
- Graph tests catch historical ALT substitution and hash changes; old ATA/WSOL,
  budget, extra transfer and signer mutation tests remain passing.
- A downstream mutation still yields `supported:false`. It is **not** presented
  as proof of a selective full-route validator. Pool/CPI/minimum-output mutations
  against an approved positive fixture cannot be completed because none exists.
- Production adapter: **NOT WIRED**, per prerequisite. No runtime allowlist change,
  UI change, frozen subsystem refactor or backend restart needed.

## Capital requirement — conditional, no funding

Fresh Mainnet finalized balances at slot **450937802**:

| Field | Result |
|---|---|
| Current Agent balance | **0.004995 SOL** |
| Owner balance | **0.107067872 SOL**, unchanged |
| Protected reserve | **0.00202 SOL**, including 0.00001 reconciliation margin |
| Required account creation for observed shape | **0.00297688 SOL** peak: two absent ATAs × RPC rent 0.00148844 |
| Max network cost | **0.00001 SOL policy cap**, not an approved route fee estimate |
| Capital before swap input | **0.00500688 SOL** |
| Minimum safe test input | **UNKNOWN — no proved executable route/input floor** |
| Minimum required balance | **UNKNOWN; conditional formula 0.00500688 + input SOL** |
| Additional SOL required | **UNKNOWN; conditional formula 0.00001188 + input SOL** |

Arithmetic example only using the old 0.0001 SOL hypothetical quote: required
**0.00510688 SOL**, additional **0.00011188 SOL**. This is not a recommended deposit
or safe test amount. Additional unproved CPI fees/account costs could invalidate
this provisional setup-only calculation. Do not fund on this basis.

Fresh RPC confirms canonical WSOL ATA `HK9b1xCN5kQdjWofPyU3DKexoNcA7Nr1uDCKvdUBfihR`
and USDC ATA `FjPUygpFHEUVpSDUM7ByKRByYTsJoN8E7vTjQCuZKQ9G` are both absent. There is
no canonical existing ATA to reuse for this captured shape. No arbitrary alternate
account is substituted. WSOL rent refund does not remove peak funding requirements.
No account was created or funded. The protected margin is not counted twice.

## Tests / preservation

**309 tests PASS** (272 baseline + 37 new), zero failures/skips. Build PASS, existing
unrelated large phone chunk warning only. Logs: `artifacts/ui/narrow-route-all-tests.log`
and `narrow-route-build.log`. No UI modifications or new browser actions.

Backend PID34832 remains healthy. Funding, Withdrawal, Controlled Real and Live
are false; global kill switch true. Seven existing wallet records retain hash
`9cacd17c08353de3d5949aafd10e05e841eca242c3832d9c6776b793d3c232f1`;
active wallet requests 0, DEX executions 0. No secret/vault access or real signing.

## Remaining readiness obligations

1. Verify current Jupiter→Deriverse CPI implementation and its exact amount,
   minimum-output rounding, fees, account segmentation and signer propagation.
2. Independently derive/decode every protocol vault and context role for the
   intended instrument, side, mints, version and authority; explain all writables.
3. Bind approved implementation semantics to current upgradeable deployments,
   with a fail-closed policy for upgrades, and prove every possible value recipient.
4. Only then run supported-positive-fixture mutations and naturally occurring new
   samples, determine full costs and executable input floor, and wire the disabled
   production adapter. Do not replace these proofs with deny-all test counts.

NOT_READY
