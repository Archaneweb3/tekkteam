# CPMM full-envelope completion

## Exact root causes

BUY old expected ATA: output USDC FjPUygpFHEUVpSDUM7ByKRByYTsJoN8E7vTjQCuZKQ9G. Actual first ATA: input WSOL HK9b1xCN5kQdjWofPyU3DKexoNcA7Nr1uDCKvdUBfihR. Both derive from Agent 7Bt9Q3EciD8ZhoRA6CviqwpLpGhn4tscPrsKfUqGfFVe and classic SPL Token. Both absent in captured RPC state. Actual creation order/keys: Agent payer, derived ATA, Agent owner, WSOL mint, System Program, classic Token Program under Associated Token Program, idempotent opcode 1. The legacy validator instead required the USDC mint/address and exactly one creation. This was composition mismatch, not a malicious ATA.

SELL old rejection: Token Program CloseAccount after the legitimate CPMM swap entered route-decoder lookup and was rejected as unsupported. It must instead occupy one exact final cleanup state, never an arbitrary allowed Token instruction.

## Fix and policy

`validateDexTransaction` explicitly dispatches the narrow internal envelope policy to complete Compute→ATA→WSOL→CPMM→close validation. Default/Jupiter validation unchanged. Quote math, pool provenance and six swap roles frozen.

- Only existing proven WSOL/USDC CPMM pool 7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny. No CLMM/v4/Token2022/other pair.
- ATA addresses independently derived in validator, not taken from frontend or metadata. Exactly two raw states required: absent, or classic initialized/unfrozen Agent-owned ATA with correct mint and no delegate/alternate close authority. Existing WSOL must have zero tokens and no unsynced excess lamports.
- Missing accounts create idempotently with exact programs/keys/order. Existing accounts do not create. SELL source must exist and cover sell amount.
- One bounded Compute price/limit pair; BUY acceptance policy 100000–1000000 lamports, slippage at most100bps. This input floor is a conservative test-policy choice, not a minimum profitable trade or protocol minimum.
- Exactly one direct swap with recomputed amounts/threshold and exact verified accounts. Complete account privilege set enforced. No unknown writable or readonly account/program.
- BUY funds exactly input lamports into Agent WSOL, then SyncNative. SELL receives native tokens through SPL transfer; no unnecessary SyncNative.
- Exactly one final CloseAccount: WSOL→Agent, Agent authority. No extra transfer, cleanup, swap, creation or trailing instruction.
- Only unsigned legacy message/one zero signature; no ALT. Signed input is rejected by this proof-only boundary.

## Full writable/value graph

All seven transaction writable accounts are explained; six swap writables plus Agent fee/rent payer. Direction reverses only validated input/output roles. Readonly config, authority, mints and program identities remain in the proven role map in concrete-cpmm-proof.md.

| Address | Owner / role | Expected pre-state | Expected post-state / why writable |
|---|---|---|---|
| 7Bt9Q3EciD8ZhoRA6CviqwpLpGhn4tscPrsKfUqGfFVe | System / Agent | RPC SOL balance; sole signer | BUY input + fee + rent debit; WSOL rent returned; SELL proceeds + rent returned |
| HK9b1xCN5kQdjWofPyU3DKexoNcA7Nr1uDCKvdUBfihR | classic Token after creation / Agent WSOL ATA | Missing, or zero native tokens with reserve-only lamports | BUY receives input then spends exactly input; SELL receives >=min proceeds; closed entirely to Agent |
| FjPUygpFHEUVpSDUM7ByKRByYTsJoN8E7vTjQCuZKQ9G | classic Token / Agent USDC ATA | BUY missing or verified; SELL synthetic valid sufficient holding | BUY receives >=min USDC, rent persists; SELL debits exactly authorized USDC |
| 7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny | CPMM / pool | Raw PDA/schema/status verified | Fee accrual and epoch update |
| 7VLUXrnSSDo9BfCa4NWaQs68g7ddDY1sdXBKW6Xswj9Y | classic Token / pool WSOL vault | Proven mint/authority/PDA, effective reserves exclude accrued fees | BUY credit input; SELL debit output |
| 3rzbbW5Q8MA7sCaowf28hNgACNPecdS2zceWy7Ptzua9 | classic Token / pool USDC vault | Proven mint/authority/PDA | BUY debit output; SELL credit input |
| 4MYrPgjgFceyhtwhG1ZX8UVb4wn1aQB5wzMimtFqg7U8 | CPMM / observation | Pool-bound PDA/schema | Price observation update only |

BUY flow: Agent SOL→derived WSOL→verified input vault; opposite vault→Agent USDC ATA. SELL flow: Agent USDC→pool vault; opposite vault→Agent WSOL→Agent SOL. Protocol/fund/LP fees remain modeled within pool input accounting; no separate arbitrary recipient. Creator fees disabled in supported pool shape.

Maximum BUY pre-cleanup debit = input + network fee cap + sum of missing ATA rent. WSOL rent included once in that peak, not added twice as another temporary-account cost. Existing nonempty WSOL rejected to avoid consuming or sweeping unrelated value.

## Positive fixtures / tests

Both reach SUPPORTED_BY_VALIDATOR with executable:false.

- BUY SHA256: 24eb4a55db73337e32912a5f7225f4c4d8cb66a525edb0357edf407b3195b4a4.
- SELL SHA256: 4f2ac560c6a7a1205ea2790203781294f8edb68ebcb9676146f5661d0dc4c809.
- tests/fixtures/cpmm-full-envelope-positive.json contains exact messages/policies. SELL explicitly ISOLATED_SYNTHETIC_SELL_PRESTATE_NOT_MAINNET, 10000 USDC base units in a raw classic-token account. No real holding fabricated.
- Full-message mutation coverage: signer/source/destination, ATA payer/owner/mint/program/address/duplicate, WSOL/authority/close destination, pool/config/vaults/observation/token program, amount/minimum ±1, ComputeBudget, extra SOL/SPL transfers, sync/cleanup ordering/missing/duplicate, blockhash and nonzero signature. Existing ATA/frozen/delegated/insufficient source/residual WSOL cases covered.
- 24 exact math parity vectors unchanged.

## Mainnet unsigned simulation

Fresh public pool state slot450945616; simulation slot450945617. Exact unsigned BUY with sigVerify:false, replaceRecentBlockhash:false. Error null; 64027 CU; fee estimate5000 lamports. Local output12409 USDC base units, minimum12284; simulated ATA output exactly12409. Simulated Agent4995000→3401560 lamports: net debit100000+5000+1488440 persistent target rent. WSOL post balance0, closed. Fixture cpmm-envelope-simulation.json records exact evidence and hash78b61d7afc313acda2ad14dc89387aef9c039d4d0e2cb73b6a271c754278bf69.

These are simulated balances, not real changes. SELL Mainnet simulation omitted because real USDC source absent; synthetic SELL validated offline. Source/deployed-binary equivalence remains the declared trust assumption from concrete pool proof, not established by simulation.

## Capital for this acceptance policy

| Component | Lamports |
|---|---:|
| Protected reserve | 2000000 |
| Minimum policy BUY input | 100000 |
| BUY fee cap | 10000 |
| Two missing ATAs, peak rent | 2976880 |
| SELL fee reserve | 10000 |
| Safety/reconciliation margin | 10000 |
| Minimum required initial balance | 5106880 |

Current Agent4995000 lamports =0.004995 SOL. Minimum safe policy BUY input0.0001 SOL. Minimum required0.005106880 SOL. Additional0.000111880 SOL. Fee observed5000 but cap10000 retained. Temporary WSOL rent1488440 is included in two-ATA peak and returned at close; subsequent SELL recreates WSOL using returned rent. Do not count refund before peak. This is snapshot/policy-specific and must be recomputed before real review. No funding performed or enabled.

## Disabled adapter and final gate

createDisabledCpmmAdapter is wired into the existing production executor dependency boundary. It consumes builder+validator through internal proveUnsigned only. Execution build/snapshot/validationPolicy remain hard-disabled, no sign/send methods, HTTP prepare/confirm unchanged and blocked. No env flag can turn this proof into a spend. Existing running backend was not restarted; no execution activation requested.

Final full suite394/394 PASS twice consecutively (cpmm-envelope-full-1.log, cpmm-envelope-full-2.log). Build PASS (existing chunk-size warning). Real Agent0.004995 SOL and Owner0.107067872 SOL unchanged; wallet ledger hash9cacd17c08353de3d5949aafd10e05e841eca242c3832d9c6776b793d3c232f1 unchanged. Funding/Withdrawal/Controlled Real/Live false; global kill switch true.

Envelope checkpoint is ready for separately authorized controlled acceptance setup, NOT ready to spend automatically. Remaining prerequisites for a real attempt: explicit user approval, fresh RPC/program identity/state/fee/blockhash checks, risk/reservation review, capital shortfall resolution, and deliberate execution activation work. No signing path connected in this phase.
