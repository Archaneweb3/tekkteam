# 088 — DOT local development versus runtime effects

## Status

Accepted, 2026-09-30. Refines decision 087; Phase A is not executed in this policy task.

## Context

The first explicitly authorized local proposal returned HUMAN_GATE solely for Mainnet identity authorization and nullable-schema requirements. Executor and pre-write reviewer prompts conflated developing source with exercising its runtime permissions. No source edits occurred in that attempt.

## Decision

Classify operation, target and resource rather than topic words. Explicit repository source editing and fixed disposable verification are SAFE_LOCAL; production databases/environment/deployment, runtime activation, custody/private material, signing/approval/broadcast, transfers and live safety flags remain HUMAN_GATE. Unrecognized effects fail closed. Descriptions cannot override resource/effect classification.

Keep mediated proposals, no live-checkout shell port, one Phase A, three repairs, no commit/push, STOP and user-diff preservation. Extend the source scope to identity-schema and ONLY the authenticated identity route inside app.js. The rest of app.js, existing imports, storage/vault code, config, deployment, transaction paths and all persistent DBs remain protected. Source schema edits are not permission to apply them to a persistent database. Other local authorization modules require separately scoped policy expansion, not a model-chosen arbitrary path.

Allow narrowly named new SQLite fixtures to use DatabaseSync(':memory:') only; file-backed database constructors and external ATTACH/VACUUM INTO remain gated. Fixed verification executes these new tests. This supports legacy/nullability/relationship/snapshot/rollback checks without exposing a migration apply command. Existing isolated suites continue using their established disposable stores. No general command, migration CLI or production database port is added.

Executor, pre-write and post-test reviewer receive the same local-versus-runtime semantics. Local fixtures certify local behavior only. If a criterion genuinely needs inaccessible production evidence, the reviewer must identify exactly what is missing; HUMAN_GATE details are retained, never replaced by fixture claims.

## Consequences

The human's next run --local-write is eligible to propose Phase A local schema and owner-authorization repairs. This is eligibility, not evidence of completed Phase A or a promise every proposal will pass. Custody and transaction semantics remain excluded; unsafe or unclassifiable code still gates. Static guards plus independent review are defense in depth, not a proof of arbitrary JavaScript security. No Phase A implementation, production operation or persistent data access occurs in this delivery.
