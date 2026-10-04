# Local delivery and qualification runbook

CURRENT2026-10-03: one isolated owner-auth preview5199 -> backend4291. Canonical
status/priority is root PROJECT_STATUS.md and EXECUTION_BRIEF.md under
PROJECT_PLAYBOOK.md. No permanent service, deployment or transaction authorized.

## Current owner-auth preview — supersedes historical fixture commands below

Inspect listeners5199/4291 and exact process CommandLine first. Keep healthy
matching processes; never stop another task on port conflict. When absent, resume
the same existing directory (verify fixture.sqlite and pump-agent-launches.json
exist first; never omit the directory or substitute a new seeded store):

```powershell
node --max-old-space-size=256 tools/local-owner-preview/owner-auth-backend.mjs 4291 5199 C:/Users/budir/AppData/Local/Temp/tekkteam-owner-auth-fwpVPj --mainnet-balance
node --max-old-space-size=256 tools/local-owner-preview/owner-frontend.mjs 5199 4291 owner-auth
```

For detached launch, use Start-Process with -WindowStyle Hidden, this repo as
WorkingDirectory, and separate stdout/stderr files. This does not survive a
machine restart automatically. Do not install a service as a workaround.
Frontend bounds esbuild concurrency/memory after env scrubbing; do not replace
with ambient Vite config. Backend validates same-directory resume and real auth.

Direct user authorization3October2026: `--mainnet-balance` permits only the existing
authenticated GET /api/wallet/mainnet-balance (optional exact ?refresh=1).
It parses ONLY MAINNET_RPC_URL from root .env; never source the environment file.
The private HTTPS reader can issue getGenesisHash/getBalance only, verifies Mainnet,
and never supplies any transaction capability to realMoneyNetwork. General outbound
guard, origin/host checks, all execution denials and money kill switches stay closed.
Without the flag, the previous fully outbound-disabled profile remains the default.
Preserve the same store/session on restart; no reconnect or new signature needed
while the stored owner session remains valid. This is not product launch activation.

Open http://127.0.0.1:5199/#/launch. Verify direct/proxy health, matching current
source fingerprint and flagsOFF; also verify actual browser content, not merely
HTTP200. `node artifacts/owner-flow-recovery/final-evidence.mjs` performs the
read-only runtime/accepted-fixture checks. Sign-in requires the selected owner's
manual signMessage review; no transaction. Exact steps/message are preserved in
artifacts/owner-flow-recovery/checkpoint.md. Never seed a human session.

The5198/4290 descriptions below are HISTORICAL rollback/reference only. Do not
start a second preview pair or use that seeded fixture to qualify real owner auth.

Latest observation2026-10-02 master recovery: backend22220, frontend36236. Verify
listener ownership and exact CommandLine again before any stop; these are observations,
not permanent IDs. Existing bBbe9P fixture was preserved across source refresh;
all33tables (including SQLite metadata), receipt journal and descriptor match.
Final source/runtime identities and times: artifacts/master-recovery/final-source.json,
runtime-after.json, final-processes.json. Current logs: backend-final.stdout/stderr.log
and frontend-current.stdout/stderr.log under artifacts/master-recovery/.

## Inspect, start and stop

From C:\Users\budir\Music\tekkteam, inspect listeners with `Get-NetTCPConnection -State Listen -LocalPort 5198,4290` and inspect each owning process CommandLine. Keep healthy matching owner-frontend.mjs/owner-backend.mjs processes. Never stop another process merely because its port conflicts. Idle ARCHANE/DOT worker remains stopped; do not restart paused orchestration.

When absent, start the existing launcher in separate terminals:

```powershell
node tools/local-owner-preview/owner-backend.mjs 4290 5198 C:/Users/budir/AppData/Local/Temp/tekkteam-owner-fixture-bBbe9P
node tools/local-owner-preview/owner-frontend.mjs 5198 4290
```

For hidden detached launch use Start-Process node with exact arguments, -WorkingDirectory pointing to this repo, -WindowStyle Hidden and separate redirected stdout/stderr files. Detached processes are not a production supervisor or guaranteed machine-restart persistence. Stop via Ctrl+C in those terminals, or Stop-Process -Id only after rechecking exact matching CommandLine and listener owner. Never kill all node processes. Restart only the affected process. The explicit third argument above resumes the validated existing fixture without reseeding or refreshing its expired session. Omitting it creates a different disposable store; do not omit it for recovery.

Historical pre-recovery checkpoint:4290 PID13804 used migrated disposable fixture
`C:\Users\budir\AppData\Local\Temp\tekkteam-owner-fixture-bBbe9P` with persisted
development vault.key. OldPID25960 was stopped before the final non-custody copy;
originaljtJ7ST remains retained, noRAMkeyextraction.32table/session/journal/image
preservation and4direct/proxyHTTP200/sourcehash checks passed. The latest
same-directory source-refresh resume also preserved these records. Verify the
currentPID/command before future operation; these IDs are checkpoint evidence.
A fresh future fixture uses
standard development key persistence. Resume it with the same launcher plus the
verified fixture directory as the third argument; fixture-resume.mjs validates
tmp-path/origin/session/journal/key/no custody/submission provenance before open.
Missing key or incompatible provenance fails closed, not permission to reseed.
Same-directory resume preserves session/journal/data; a new unnamed fixture does
not preserve them. The existing frontend proxy remains5198 ->4290.

Acceptance: frontend HTML/assets/bootstrap and direct/proxied health readable; fixture safety flags remain OFF for broadcast/funding/withdrawal/Live, outbound RPC unavailable, all kill switches authoritative. HTTP200 alone is insufficient. Browse actual Home/Launchpad/Tokens/Agents and error states. Guest API denial is not backend downtime. No browser cookie/session injection, no auth/ACL/RPC relaxation. Actual wallet owner qualification requires a separately provisioned non-production owner environment and available genuine extension; current fixture deliberately cannot establish it.

## Persistence and recovery

Create source-only snapshots with `node tools/continuation-snapshot.mjs baseline-<unique-label>`; labels are bounded and existing destinations refused before copying. Never include .env, custody secrets, private stores, logs or .dot. Source backup is not a database backup. Product database/custody backup requires the operator's established encrypted procedure, separate restricted access, stopped writers and a disposable restore verification. Do not improvise custody export or overwrite a live store.

Receipt corruption/missing/version mismatch/abandoned lock: stop affected writers, preserve bytes and evidence, inspect signature and canonical storage with authorized operator. No automatic lock clearing, file reset, initialization or rebroadcast. Restore only a verified operator backup on an isolated copy; never infer missing receipt means no launch. Windows file fsync/rename acknowledgement does not prove power-loss durability. Signed UNKNOWN reconciles the same signature and verified mint; a null status is not proof of non-delivery. Unsigned Awaiting approval replacement requires explicit owner action, old blockhash expiry and mint absence on verified Mainnet before durable invalidation.

Paper restarts paused; preserve decisions/positions/history and validate associated mint again before Start. Pause is not liquidation. Real pending transactions require reconciliation, not replay. Withdrawal/funding/emergency paths remain separately gated; no background job or supervisor is installed by this work.

## Authorized-test preparation

No real test is currently READY: owner extension auth, public delivery, read-only Mainnet qualification and exact budget authorization are missing. Use initial buy0 for the proposed launch test; quote network/rent/actual launch overhead from a fresh exact simulation, not historical costs. Owner/payer/signer is the authenticated selected owner Solana account; on-chain creator follows exact current creation instruction. Optional Agent execution wallet is separate server custody, not the launch payer. One explicit approval for one reviewed transaction only; user handles wallet approval. Stop if message/program/metadata/expiry/balance/budget differs. Success requires matching signature, verified mint and durable receipt, not wallet approval or RPC acknowledgement alone.

Trading test cannot be prepared as tradable while the existing CPMM executor lacks Pump bonding-curve / verified migrated-pool support. Future plan must pin mint, verified venue/program/accounts, allocation, per-trade/daily/loss/slippage/fee reserve limits and duration, explicit owner authority, pause and reconciliation. Launch authorization never authorizes trading or funding. No arbitrary AI code or prompt can bypass deterministic rules/Risk. Keep LiveOFF throughout local qualification.

Decision093 records CURRENT unmounted Pump/PumpSwap raw decoder/quote/unsigned
inventory/simulation/effects modules and quote-only executor boundary. Local
fixture success is not actual venue support. BUY spendable budget/WSOL effects
do not satisfy the unchanged Real exact-SOL-debit/reservation contract; never
relax that equality or mount an adapter merely to pass a fixture. Account
provisioning, unknown post-state/fee allocation, deployed-program evidence and
authentic finalized receipts remain separate gates. No test signer/broadcaster
is added to these Pump modules.

## Release preparation

Canonical staging artifact: `node tools/build-wallet-test.mjs` uses the isolated Vite
configuration and dedicated Reown environment only. Verify generated
`site/src/token-draft-schema.js` is byte-identical to the current source and resolve
raw public-module imports, not just the bundled entry. The staging Nginx template
must match the built revision alias and proxy only the bounded public metadata/API
paths to4395. Never expose DATA_DIR or install that block into production.

The staging SQLite backup with quick_checkOK is database evidence only. Full runtime
restore requires a consistent isolated backup/restore of the operator-managed auth
key/marker, SQLite, launch journals and metadata with stopped staging writers. Keep
restricted material outside Git/artifacts/cloud. This qualification is not complete;
never roll back a live database after broadcast or erase durable transaction facts.

Run test suites serially and config/env-file-free bundle build. Inspect desktop1440/mobile390 screenshots and actual owner flows, then independent source/security review. Stage deployment requires named target, approved secret injection, persistence volumes, supervisor/health/log redaction, backups and rollback artifact; production deployment needs separate user authorization. Do not launch server/index.js with ambient credentials as a preview fallback. Never roll back unrelated user changes, receipt history or irreversible chain facts.

## B2 product HTTP-only mode (local, explicitly selected)

CURRENT source: the existing product entrypoints now accept `--http-only` before
loading dotenv or operational initialization. Ordinary startup is preserved in
server/operational-api.js and server/operational-launch.js. Do not run ordinary
startup as an inspection fallback: its original operational capabilities remain.

This mode reuses createServer/createPumpLaunch and the process isolation mechanism
from the owner preview; it does not create a separate backend implementation or
replace preview5199/4291. HTTP auth uses the normal challenge/signature verifier.
No session is seeded. No worker, initial RPC verification, signing worker, external
network, launch preparation, publisher, funding, withdrawal or broadcast is enabled.
API allows only existing auth/state/identity/draft routes; forbidden routes return
403 HTTP_ONLY_OPERATION_DISABLED before product handlers. Launch permits only its
capability health endpoint; even read-status reconciliation is disabled because it
can query RPC/change receipts. Denied dependencies protect the factory as well as
the HTTP boundary. /api/runtime-capabilities and /pump-launch/health report the mode.

**Not a read-only database viewer:** product schema initialization, auth sessions,
identity and draft writes can modify the explicitly selected local store. All
existing Mainnet/auth/owner/idempotency checks remain. No production dataset is
selected automatically and no migration, missing journal or key is synthesized.
Startup requires an absolute existing directory, Mainnet network_binding, existing
strict launch journal, regular nonlinked DB/WAL/SHM files, and API vault.key.
An original matching vault key must remain in place. Use only an operator-selected
local dataset with no competing writer; preserve its backup before starting.

Commands below are a template, NOT executed against canonical data in B2:

```powershell
node server/index.js --http-only --data-dir "<verified absolute local DATA_DIR>" --port 4190 --origin http://127.0.0.1:5188
node server/pump-launch-index.js --http-only --data-dir "<same verified DATA_DIR>" --port 4193 --origin http://127.0.0.1:5188
```

An explicit `--metadata-origin https://<approved-host>` may configure local draft
image paths; it does not publish or verify public delivery. Without it draft
configuration truthfully remains unavailable. Never copy an invented origin or
assume hosting verified. Both processes bind127.0.0.1 and reject preview ports.
Health must report HTTP_ONLY and all effect capabilities false. Do not use the
ordinary startup commands if validation fails. Ctrl+C closes the selected process.

B2 verification uses temporary test storage with real product factories and test
keys solely to exercise this boundary; it is not a new user preview or proof of a
human owner/real launch. No permanent4190/4193 process was started. Existing5199/4291
remains the accepted owner preview; its running source snapshot predates these
entrypoint-only changes and is intentionally not restarted during human testing.

Historical standalone receipt recovery still requires original association evidence.
A new authorized launch does not require inventing/recovering that old association;
it needs an explicitly provisioned canonical dataset, owner authentication, verified
metadata/cost/transaction flow and separate wallet approval. HTTP-only mode intentionally
cannot prepare or launch. Hosting remains PENDING_EXTERNAL.
