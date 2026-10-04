# 092 - Single-phase serial supervisor execution policy

Date: 2026-09-30. Status: accepted; single-phase routing activated and verified
read-only. This documentation task executes no product phase.

## Supersession

This decision supersedes the **CURRENT EXECUTION POLICY** portions of
[090](090-dot-roadmap-autopilot-local-batches.md) and
[091](091-archane-normal-user-local-worker.md): the former two-phase "first
explicitly authorized" autopilot command and the latter two-phase worker product
mapping are historical implementation/authorization context, not current default
or ongoing authorization. Both ADRs remain unchanged. Their safety, isolation,
review, durable evidence and reconciliation requirements continue to apply.
Existing multi-phase CLI capability is not permission to use it.

## Current execution policy

- `RUN_NEXT_PHASE LOCAL_WRITE` is the active product routing command. Its fixed
  mapping is `dot/cli.mjs run-next-phase --local-write`; maximum product phases
  per run is **exactly 1**. No call to multi-phase autopilot or phase-advance loop.
- Product work is **serial only**: one lead implementer/integration owner,
  serialized tests/build and independent pre-write/post-test review, bounded to
  at most three repairs of the selected phase. Parallel product execution is
  disabled until separately proven and explicitly authorized. Parallel fixture
  observations do not qualify a product implementation workflow.
- Select the next incomplete phase from the repository roadmap and durable
  completion evidence. Do not skip phases, replay completed work or infer
  authorization from chat history, process exit alone or model claims. Persist
  the same request ID, child evidence, events and terminal result; uncertain
  mutation remains a reconciliation gate.
- On this date, canonical Phase A is **COMPLETE / PASS**; next eligible phase is
  **B - Navigation and minimum shared primitives**. B and C have not executed.
  A B run must stop after B; **C must not start in the same run**. Reporting C as
  the next eligible phase does not execute or authorize it. Consult live state
  rather than treating this dated observation as a permanent phase cursor.
- Archane supervises through **Archane -> normal non-elevated user worker ->
  DOT -> Codex**. Never invoke Codex directly from the Archane sandbox. The user
  is not a terminal-output relay. Read status/results directly and monitor the
  same request; limitations of chat delivery are separate from execution safety.
  Worker PID and heartbeat are live observations, not policy constants.

## Boundaries

Each product run still requires explicit authorization for that one phase.
This ADR records routing policy; it does not start B or authorize a later phase.
Preserve existing HUMAN_GATEs for production deployment; SSH/VPS mutation;
production DB mutation/migration apply; custody changes; secret rotation;
wallet signing/approval; broadcast; Pump.fun token launch; funding/withdrawal;
real-money execution; Controlled/Live/Autonomous enablement; kill-switch or
emergency-stop changes; and destructive production operations. Do not alter
permissions, identity, startup or credential access. Worker restart requires
separate explicit approval and verified idle/no-pending/no-STOP/no-LOCK/no-hold
preconditions. No automatic commit or push.

Product scope/design remains governed by PRD, SYSTEM, ARCHITECTURE, DESIGN,
LAUNCHPAD-IMPLEMENTATION and the relevant product ADRs. Agent identity, Token,
Agent Wallet, Trading Engine and Paper/Real boundaries are unchanged.

## Evidence and limits

Single-phase source regression suite passed 134/134; isolated tests cover A->B
selection, B-only completion/repair, gate stopping, no skip/duplicate/spillover.
An approved normal-user worker restart activated the route, followed by
read-only routing/state/owner/heartbeat verification. These are infrastructure
proofs, not Phase B acceptance or production verification. The earlier
unexplained 126/127 infrastructure run remains diagnostic history; later clean
runs do not explain its original cause. Known parallel telemetry/reviewer
persistence gaps do not authorize parallel product work or removal of a real
safety hold.
