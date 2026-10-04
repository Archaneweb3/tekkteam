# 090 — DOT roadmap autopilot, safe local batches

Status: implemented locally, 2026-09-30. Autopilot/product phases have NOT been executed during this implementation. Phase A completion evidence remains the starting authority. Production and real-money permissions are unchanged/denied.

## Decision

`node dot/cli.mjs autopilot --local-write --max-phases=2` is the first explicitly authorized human command. Without `--local-write` it gates before any product invocation. Default batch maximum is three; accepted explicit range is one to three. This does not change the legacy fixed Phase A command or its one-phase policy. Each child still owns exactly one roadmap contract and at most three repairs.

Read the ordered headings in `docs/LAUNCHPAD-IMPLEMENTATION.md`; reject missing/duplicate/gapped phases, noncontiguous completion or changed completed contracts. Seed A only from its durable local completion report, not prose or model claims. Reread relevant project sections and ADR/research at each boundary. Do not derive the next phase from chat history. Release phase L remains a separate human gate.

## Mediated source boundary

Executor and independent reviewers use tool-disabled, secret-free scratch workspaces. Models propose strict unique exact text edits. The supervisor owns the only writer, constrained to the current enumerated local presentation/pure-contract source and bounded fixture/doc additions. Protected paths, imports, executable capability additions, transaction/authorization changes, deployment and persistent data are denied. An independent pre-write safety review precedes hash/CAS checks and writes. There is no generic shell, SSH, production, wallet or git-write port.

The scope is intentionally conservative: a legitimate change that cannot be statically classified stops for review rather than granting unrestricted source execution. Existing frontend adapter imports remain exact; new static relative presentation imports are allowed only within the same enumerated phase scope and pass the same executable-capability guards. B has no backend write scope. Topic words in explanatory documentation do not grant runtime authorization. Existing staged/unstaged work is retained and recorded; no reset, stash, deletion or automatic rollback.

## State, evidence and continuation

`.dot/autopilot-state.json` owns the batch ledger. `.dot/phase-X.json` owns the exact proposal/pre-review/apply/verify/review cursor, changes and repair count. Separate `.dot/runs/<phase-run-id>/` task, baseline, proposals, diff, tests, reviews, verdict and report are auditable. Common exclusive lock prevents overlapping supervisors.

After PASS, persist child COMPLETE before parent ledger advancement. A parent crash between these writes resumes the completed child without repeating it. Codex usage/auth/model failures retain the exact cursor. At review, resume repeats review only; at pre-review, reconstruct candidate text from unchanged current source rather than applying serialized redacted diagnostics. Persist APPLY before writing; interrupted or uncertain APPLY is RECONCILIATION_REQUIRED and never automatically replayed. External/user source changes fail closed.

`node dot/cli.mjs stop` or `.dot/STOP` prevents new work. `node dot/cli.mjs resume` explicitly resumes an authorized stopped/external-blocked batch; it clears only the known STOP marker for a STOPPED batch. Human/uncertain-write gates cannot be cleared by resume. A batch-limit completion requires a new explicit autopilot command to start the next batch. Repairs do not consume additional phase slots.

## Real visual evidence

For UI phases, isolated temporary local fixture API + ephemeral Vite + Playwright capture actual PNGs at 1440 and 390. GET-only API interception denies mutations; external browser traffic is aborted, command environment excludes RPC/auth secrets. Captures cover disconnected/empty, loading and service error states and carry SHA-256. They do not claim populated owner coverage. Existing full-suite interactions and phase-specific fixtures must also pass; reviewer must flag any missing phase acceptance evidence.

The independent post-test reviewer receives copied screenshots through the documented Codex CLI image input plus the design contract and actual test output. Browser logs alone cannot certify visual quality. Missing/changed screenshots, unavailable browser capture or visualReview other than PASS blocks completion. No new screenshots imply the product phase already shipped.

## Validation boundary

Autopilot progression, bounded repair, STOP, external recovery, no duplicate writes and artifacts are tested in disposable fixture repositories. Screenshot plumbing is smoke-tested separately against local fixtures. No real roadmap phase, production service, wallet approval, signature, broadcast or transaction is executed by these tests.
