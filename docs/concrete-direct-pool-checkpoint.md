# Concrete direct pool checkpoint

## Final gate

NOT_READY. One concrete pool per venue, no signing/broadcast/funding or live wallet requests. No production adapter created or enabled. Jupiter preserved and locked.

Detailed address/role tables, source versions, public Mainnet snapshots, quote evidence and exact message hashes are in [PumpSwap proof](concrete-pump-proof.md) and [CPMM proof](concrete-cpmm-proof.md).

| Gate | PumpSwap | Raydium CPMM |
|---|---|---|
| Pool | GseMAnNDvntR5uFePZ51yZBXzNSn7GdFPkfHwfr6d77J | 7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny |
| Classic subset/provenance | Snapshot verified | Snapshot verified; WSOL/USDC, not memecoin coverage proof |
| Math parity | Blocked exact-in reference and buyback semantics | 24 exact integer SDK-source vectors |
| Complete writable proof | Not established; buyback ATA unresolved | Six swap roles explained; full validator composition not complete |
| BUY message | Not constructed after evidence rejection | Exact unsigned fixture; ATA_MISMATCH |
| SELL message | Not constructed after evidence rejection | Exact unsigned structural fixture; unsupported cleanup; real source absent |
| WSOL/ATA | Not built | Independently derived; isolated lifecycle passes, routeVerified false |
| Full-envelope mutations | No positive fixture; not claimed | Swap-level mutations only; full-envelope positive suite not claimed |
| Simulation | Not run after rejection | Not run; validator rejection and absent actual SELL source |
| Value-flow | Incomplete side recipients | Swap-level explained; complete execution approval absent |
| Deployment | Metadata/hash captured, binary equivalence unproved | Metadata/hash captured, binary equivalence unproved |
| Status | REJECTED_UNPROVEN_BUYBACK_REMAINING_ACCOUNTS | PARTIAL / NOT SUPPORTED_BY_VALIDATOR |

Source/binary correspondence remains an explicit trust assumption, not silently treated as cryptographically proved. CPMM native-envelope integration is an implementation gap, not an assertion that the protocol is impossible to verify.

## Test and safety results

Final full suite: 322/322 PASS twice consecutively. Build PASS. [Determinism investigation](concrete-suite-determinism.md) records test-only changes and the unresolved historical transport cause; no retry masks failures.

Read-only finalized balances: Agent 4,995,000 lamports (0.004995 SOL), Owner 107,067,872 lamports. Wallet ledger hash remains 9cacd17c08353de3d5949aafd10e05e841eca242c3832d9c6776b793d3c232f1; seven wallet records remain terminal. No transaction sent by this phase.

Health OK; Funding false, Withdrawal false, Controlled Real false, Live Trading false, global kill switch true. Legacy health network/broadcast fields are not a DEX permission. No runtime restart needed for offline proof/test changes.

Minimum required balance and additional SOL: NOT CALCULATED. Neither candidate has supported BUY+SELL; capital modeling gate remains closed. No funding requested.

Remaining blockers: PumpSwap exact-in/remaining-account fee effects; CPMM complete native-envelope validator integration and adversarial acceptance; absent real SELL source; fresh state and deployment trust policy before any future acceptance. This checkpoint does not authorize execution.
