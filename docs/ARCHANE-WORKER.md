# Archane local worker

Implementation: `dot/worker.mjs`; decision [091](decisions/091-archane-normal-user-local-worker.md).

## One-time normal-user setup

In non-administrator PowerShell as budir:

```powershell
& 'C:\Users\budir\Music\tekkteam\dot\install-worker.ps1'
```

Validates the actual user/home/Codex version, installs only
`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Archane DOT Worker.lnk`
and starts the hidden worker. No execution-policy change or elevation is used.
The shortcut invokes fixed VBS → PowerShell → native Node worker. Duplicate
startup is refused by the exclusive worker lock. No network listener exists.

## Archane file interface

Control: `C:\Users\budir\Music\tekkteam\.dot\control`.
No Archane source path was supplied; this is the integration contract for its
existing workspace access, not a claim that the external application was patched.

Write complete UTF-8 JSON to a temporary name, then atomically rename to
`requests/<requestId>.json`. UUIDs are lowercase; no extra fields accepted.

```json
{
  "requestId": "<new lowercase UUID>",
  "command": "STATUS",
  "timestamp": "2026-09-30T14:00:00.000Z",
  "project": "TEKKTEAM",
  "authorizationMode": "READ_ONLY"
}
```

| Command | Authorization | Exact mapping |
| --- | --- | --- |
| STATUS | READ_ONLY | `node dot/cli.mjs status` |
| PLAN | READ_ONLY | `node dot/cli.mjs plan` (pure proposal) |
| REPORT | READ_ONLY | `node dot/cli.mjs report` |
| STOP | READ_ONLY | `node dot/cli.mjs stop` (cooperative) |
| RUN | LOCAL_WRITE | `node dot/cli.mjs run --local-write` |
| AUTOPILOT | LOCAL_WRITE | `node dot/cli.mjs autopilot --local-write --max-phases=2` |
| RESUME | LOCAL_WRITE | `node dot/cli.mjs resume` (DOT authoritative) |

RUN remains the existing one-phase local executor, not roadmap advance. To
continue, inspect PLAN and separately authorize AUTOPILOT. Neither is executed
during worker validation. READ_ONLY does not authorize product writes. LOCAL_WRITE
means safe local source only, never production/custody/money/kill-switch access.
Do not include credentials or arbitrary task text in requests.

Optional command writer (same protocol; Archane can write files directly):

```text
node dot/control.mjs status
node dot/control.mjs enqueue STATUS READ_ONLY
node dot/control.mjs enqueue PLAN READ_ONLY
node dot/control.mjs enqueue RUN LOCAL_WRITE
node dot/control.mjs enqueue AUTOPILOT LOCAL_WRITE
node dot/control.mjs enqueue REPORT READ_ONLY
node dot/control.mjs enqueue STOP READ_ONLY
node dot/control.mjs enqueue RESUME LOCAL_WRITE
```

Poll `current.json`: PID, heartbeat, running user/version, active request, last
request/result and reconciliation hold. Heartbeat older than 5 seconds is not
healthy; it does not prove that active work failed or may safely be retried.
Read `results/<requestId>.json`, not just latest `result.json`: a concurrent
STATUS can finish while RUN remains active. Results contain sanitized stdout/
stderr, actual exit code and canonical DOT status summary. Child COMPLETE does
not itself certify a product phase; DOT artifacts/reviewer evidence do that.

Duplicate UUIDs never launch again; changed intent conflicts. BUSY is terminal
for its request, not deferred automatic execution. STOP takes precedence over
pending starts; it never kills a model or releases a real-money reservation.
Existing DOT STOP/resume/LOCK policy remains authoritative.

## Crash handling

Claims precede launch and record the child PID when known. Interrupted mutations
return RECONCILIATION_REQUIRED. No automatic replay, source reset, stale-lock
deletion or orphan kill. STATUS/REPORT/PLAN remain usable. A known dead child
allows explicit RESUME to delegate inspection to DOT; DOT may still block.
Missing PID or a still-live child needs manual process/state reconciliation.
Losing a heartbeat alone is not sufficient evidence.

## Diagnostic proof only

```text
node dot/control.mjs enqueue RUN FIXTURE
node dot/worker-verify.mjs
node --test dot/*.test.mjs
node node_modules/vite/bin/vite.js build --configLoader native
```

FIXTURE uses existing `runFixture` with an isolated ledger under
`control/fixtures/<requestId>`, a disposable temporary math workspace and a
separate tools-disabled reviewer. It cannot select product tasks/prompts.
RESUME FIXTURE requires `resumeRequestId` for that exact fixture and obeys STOP
and uncertainty gates. Canonical STOP is mirrored to the fixture; the worker
never clears it merely to make a fixture pass. Completed fixtures cannot resume.
`worker-verify` sends only STATUS/PLAN/RUN FIXTURE, proves a harmless actual Codex
probe and structured independent review, checks protected source/canonical DOT
hashes and records `.dot/runs/worker-context-validation/validation.json`.
This consumes account usage, not an automatic heartbeat job.

Do not delete a lock without independent PID/child-chain reconciliation.
Deleting the Startup shortcut prevents future startup, not current DOT work.
No production or real-money operation is implemented by this worker.
