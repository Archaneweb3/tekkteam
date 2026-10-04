# 087 — Explicit DOT local source authorization

## Status

Accepted, 2026-09-30. Capability implemented only; no TEKKTEAM phase run authorized during delivery.

## Context

The fixture write/repair proof is complete. The human now authorizes safe local source edits but excludes production, custody, migration/apply, real-money authorization, wallet actions and destructive operations. A sandbox with shell access to a checkout containing persistent custody data is not an appropriate extension of that authorization.

## Decision

Use exactly `node dot/cli.mjs run --local-write`. No persistent allow flag is enabled; plain run stays gated. The authoritative planner selects Phase A; one phase and three repairs are fixed, not model-controlled. Local writable paths are enumerated in `dot/local-write-policy.mjs`; server/app/config/store/identity-schema, custody/DEX/auth/transaction modules, deployment/scripts, DOT itself and all persistent data are excluded. New tests require the bounded launchpad-local filename convention. Expansion needs an explicit reviewed policy change, not model output.

Use the installed tool-disabled read-only Codex profile to return strict exact text edit proposals. The model receives redacted public scope/context, never a live-checkout tool port. The supervisor statically checks paths/code/imports/protected authorization fields and uses a separate pre-write reviewer. It applies only approved exact matches with compare-before-write checks, preserving existing user text. This mediated writer is an intentional alternative to granting arbitrary model shell/workspace access. Reviewer cannot override path/capability gates.

After apply, run existing isolated test/build verification and a separate post-test reviewer. A proposed sensitive change returns HUMAN_GATE before apply. Safety findings, malformed output, unexpected source changes and missing objective completion evidence cannot PASS. No deployment, SSH, RPC transaction, generic command, commit or push action is exposed.

## Safety and interruption

Record unstaged/staged scoped Git diff and source hash baseline; compare new changes against that baseline, not Git cleanliness. Journal pending hashes before APPLYING, record each written file, retain original user edits and never auto-reset/stash/delete. Interrupted/partial apply enters RECONCILIATION_REQUIRED. Usage/auth/model failures preserve local-state and cursor; if a failed run already wrote files, another run is refused until explicit reconciliation. Automatic local mutation resume is deliberately unavailable rather than replay uncertain writes. `.dot/STOP` is checked before calls and writes.

Static analysis is deliberately conservative and not a general proof of arbitrary JavaScript safety; unclassifiable/capability-changing proposals gate. Tests use disposable repositories and stubbed model/verifier results to exercise mediation, never the real Phase A or real transactions. This delivery does not run the authorized human command.

## Consequences

Local safe source/test/doc write capability is explicit and usable. Sensitive Phase A schema/provenance repair may still gate; the flag is not permission to complete every previous reviewer request. Production and real-money flags remain unchanged. Defaults remain AUTO_COMMIT=false and AUTO_PUSH=false. Phase B is not selected automatically.
