# 091 — Archane normal-user local DOT worker

Date: 2026-09-30. Scope: local tooling only; no product phase or runtime activation.

## Context

Archane's restricted task user cannot resolve its own Codex home. Copying owner
credentials or relaxing that sandbox is not an acceptable solution. The real
`bachira\budir` non-elevated Windows session already has a working CLI installation.

## Decision

A hidden user-login Startup worker consumes immutable UUID request files in
`.dot/control/requests/`. It invokes fixed Node/DOT argument arrays, never a shell,
and retains existing home hints and the credential-free child environment. CLI
authentication stays in its owner context; the worker does not inspect, copy or
expose credential/config contents.

Only explicit LOCAL_WRITE permits RUN/AUTOPILOT/RESUME; default READ_ONLY cannot
invoke them. DOT owns phase selection, writer/reviewer gates, repair limits and
production/real-money denial. AUTOPILOT uses a fixed bounded two-phase batch;
RUN retains the existing one-phase command. This task executes neither.
FIXTURE is a separate diagnostic mode with a fixed helper, isolated ledger and
the existing disposable math fixture/reviewer, not product writes.

Claims are fsynced before launch; results are immutable per request. One mutator
runs at a time. STATUS/PLAN/REPORT and cooperative STOP remain available.
On restart, incomplete claims are never replayed. A potentially live child or
unknown spawn/PID boundary blocks resume. A known dead child permits only explicit
RESUME, delegated to DOT reconciliation; stale DOT LOCK is never removed.
Successful resume durably references the old claim without erasing history.

## Boundaries

This is private filesystem IPC, not a new OS sandbox or authenticated public API.
Anyone able to rewrite trusted repository executables already has the same local
user privileges; queue validation is not protection against that capability.
There is no listener, administrator/SYSTEM service, SSH/deployment port, arbitrary
prompt/argv/path/executable, credential port, automatic commit or push.

The control heartbeat is ephemeral observation, distinct from canonical phase
state/run evidence. Planner regression checks retain all canonical ledger,
artifact and source byte checks, excluding independently generated IPC.

## Consequences

Archane submits complete request JSON by atomic rename, polls the heartbeat and
reads the exact UUID result. No terminal/output copy is needed after setup.
Authorization stays explicit per request, never blanket production permission.
Uncertain requests require reconciliation, not re-enqueueing/replacing their IDs.
Startup is confined to the current user's Startup folder; retain the installed
repository location. See [worker contract](../ARCHANE-WORKER.md).
