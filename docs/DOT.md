# DOT - local development supervisor

## Archane control-path recovery (CURRENT)

`node dot/cli.mjs plan` now emits an ephemeral read-only roadmap proposal. It is dispatched before writable storage initialization and does not alter state, phase completion, attempts, verdicts, gates, STOP, locks or run history. It never calls a model or authorizes execution. `dry-run` and `run --dry-run` retain their older state-writing rehearsal semantics; they are not read-only planning commands. Phase A completion is preserved and Phase B is not executed by this infrastructure work.

DOT resolves Codex from PATH first, then dynamically discovers native binaries beneath the installed OpenAI Codex location. Each candidate must return a valid `codex-cli` version, arguments remain structural, and Windows wrappers are not run through a shell. No installation hash is hardcoded. Existing nonsecret Windows home hints are retained in the filtered subprocess environment; credentials and alternate authentication-home overrides are not copied. Current sandbox execution still reports `Could not find home directory` even when the installed CLI is found: model delegation and real disposable-fixture execution remain BLOCKED until the existing authenticated executor environment is available without expanding credential access.

The operator explicitly authorized trust for this exact repository. On Windows, DOT's Git subprocesses use command-scoped `-c safe.directory=<canonical repository path>` only when the working directory resolves to this repository. No global trust, wildcard, ACL or execution identity is changed. Rev-parse, status and diff are verified with this scope; unrelated repositories receive no trust override.

On Windows the DOT verifier uses the installed Vite `--configLoader native` option to load the unchanged native-ESM `vite.config.js`. The default config bundler probes denied parent directories in this execution environment; native loading successfully builds the same project without changing access permissions, output settings or acceptance gates. Build failures still fail verification. The product `npm run build` script is unchanged; this is a DOT verification compatibility setting, not a product phase or deployment.

## Roadmap autopilot (explicit local batches)

Decision [090](decisions/090-dot-roadmap-autopilot-local-batches.md) adds a separate roadmap batch mode above the legacy fixed Phase A modes described below. Implemented/tested locally; **not run against product phases yet**.

```powershell
node dot/cli.mjs autopilot --local-write --max-phases=2
node dot/cli.mjs status --autopilot
node dot/cli.mjs stop
node dot/cli.mjs resume
```

Plain `autopilot` is denied. Default maximum is three completed phases, first human command explicitly limits two. Roadmap/state determine the first incomplete phase; no manual prompt between passes. Each child gets independent task/diff/tests/review/verdict/report, max three repairs and separate state. Real 1440/390 screenshots are required for UI review; unavailable evidence is never visual PASS. Batch output is concise; detailed evidence stays under `.dot/runs/`.

STOP and external failures preserve the exact cursor. Resume never replays an uncertain write or clears a human gate. Completed batches require a new explicit command to authorize the next batch. Production, SSH/deployment, custody/secrets, transactions, runtime enablement, commit and push remain denied. Legacy text below describes earlier/default modes, not an automatic cross-phase permission.

Status: **Phase 2 disposable write/repair executor**, with product implementation still **not activated**. DOT does not override AGENTS.md or authorize Phase B. `run --fixture` executes the fixed, disposable percentage-calculation fixture; `review` executes the real Phase A read-only gate only after real fixture proof. Neither grants product-writing or trading authorization.

## Explicit local source authorization

Decision 088 refines decision 087: schema and identity-owner authorization SOURCE development is allowed, not runtime activation. The guarded scope now includes identity-schema.js and only the authenticated identity route in app.js; storage/custody/config/other routes remain excluded. New bounded SQLite tests may use in-memory databases, never persistent source/production DBs. Topic words do not constitute actions. Missing genuine production evidence still stops with its exact reason. Phase A has not been run during this policy refinement.

The latest human authorization adds **mediated safe local source writes**:

```powershell
node dot/cli.mjs run --local-write
node dot/cli.mjs status --local
node dot/cli.mjs report --local
```

The first command has NOT been run against TEKKTEAM during implementation. Plain `run` remains gated. Mixed authorization flags are rejected; no environment/config switch enables this silently. The fixed current phase is A, MAX_PHASES_PER_RUN=1 and MAX_REPAIR_ATTEMPTS=3. See decision 087 for the new boundary; older fixture-only statements below describe the previous default and continue to apply when this explicit flag is absent.

The model proposes structured exact text edits with tools disabled; it cannot run commands or read live data. DOT checks an enumerated Phase A source/test/doc scope, import/capability changes and protected authorization fields, obtains an independent PRE-WRITE review, then applies only unique exact-match edits after checking current hashes. A second independent review follows actual isolated tests/build. Sensitive schema/migration/custody/transaction/authorization changes still HUMAN_GATE. This is intentionally narrower than arbitrary workspace-write shell access. No production/network/wallet/Git write action port exists.

State is `.dot/local-state.json`; artifacts preserve scoped staged/unstaged baseline diff, source hashes, exact DOT-created change ledger, model reports and evidence. Existing dirty text is retained. STOP blocks calls and apply; partial/uncertain apply requires reconciliation. External limits retain progress. Failed runs with existing writes cannot be restarted blindly; no automatic local-write resume or rollback is provided. A new run after a completed phase still requires a new explicit human command and never advances to B.

## Phase 2 modes and evidence

```powershell
node dot/cli.mjs dry-run
node dot/cli.mjs run --fixture
node dot/cli.mjs resume --fixture
node dot/cli.mjs review
node --test dot/dot.test.mjs dot/phase-two.test.mjs
```

`run` without `--fixture` returns HUMAN_GATE; no generic task/executable escape hatch exists. `dry-run` has zero model calls. `review` now explicitly runs tests/build and a separate tool-disabled read-only reviewer; it is not silently a dry-run. It proposes a repair but never executes one. Production, custody, trading, commit and push operations have no action port. The older SUPERVISOR_TEST section below describes the initial adapter, retained for unit regression compatibility, not permission for product writes.

Implementation uses installed `codex exec --sandbox workspace-write --output-schema ... --json` with ignored user config/rules, ephemeral sessions, explicit `windows.sandbox="elevated"`, network_access=false, no extra writable roots, no plugins/apps/web, and filtered environment. Ignoring user config also removed the locally configured Windows sandbox, which caused the first real probe to fail with policy rejection; explicitly selecting the existing native sandbox fixed it without danger-full-access. Review uses a different invocation/session, read-only sandbox and disabled tools. This verifies the local fixture flow, not arbitrary sandbox penetration resistance or a general safe product executor.

The deliberately staged fixture fixes ordinary percentage math first. Supervisor-owned acceptance probes require clamping too, creating a real failed assertion (-100 versus 0). The independent reviewer must request a narrow repair; only actual tests and a separate final reviewer can complete. Reviewer PASS alone cannot override failed acceptance, unexpected files, STOP or missing repair proof. Executor and reviewer schemas reject extra/missing/wrong fields and contradictory PASS. Raw JSONL remains in memory; only redacted reports, exit/turn/session/usage metadata, baseline, exact file diff context and test outputs persist.

Fixture state is `.dot/fixture-state.json`, separate from real `.dot/state.json`. A write is journaled WRITE_RUNNING before invocation, WRITE_COMPLETE before testing, then TEST/REVIEW/REPAIR. Interrupted or ambiguous write requires RECONCILIATION_REQUIRED; resume tests/reviews existing files first and never replays the old mutation. External usage/auth/model/CLI failure is BLOCKED_EXTERNAL with the same cursor retained; an ambiguous write remains flagged even when the blocker is external. STOP prevents new invocations; after a completed write it retains the TEST cursor. Hard-killed LOCK still requires PID inspection, not automatic removal. Fixture hashes bind final proof to the actual current disposable files before real review.

The sensitive-word classifier supplements structural isolation; it is not an arbitrary-language security oracle. Indirect and obvious risky tasks fail before invocation, including reviewer repair instructions, while the stronger guarantee is that only one built-in fixture, a fixed two-file scope and fixed test commands are accepted. Before executing model-written fixture tests/modules, a narrow AST allowlist permits only pure percentage/label arithmetic and fixed Node test/assert imports; filesystem/network imports, arbitrary globals and reflective properties are rejected. This is not a generic safe-code analyzer. Dirty product work is never reset, staged, committed or attributed to DOT. Real review fingerprints source before/after, includes current diff and untracked contract source, and tests through the existing isolated fixture runner. Real product mutation remains a future separately approved task.

Plain `resume` selects the latest interrupted fixture journal when applicable; explicit `resume --fixture` removes ambiguity. A blocked read-only rehearsal resumes its REVIEW cursor with unchanged source fingerprints, or reruns safe verification if verification never completed. It never enters product implementation. Completed runs cannot be resumed for mutation. The one early fixture journal lacking a final-snapshot field can be reconciled read-only through tests and a fresh independent review; this compatibility path does not replay implementation.

## Integration verified locally

Codex CLI 0.159.2 is installed and ChatGPT authentication status is valid. Installed `codex exec --help` supports stdin prompts, JSONL, ephemeral execution, sandbox selection and output capture. `codex exec resume --help` confirms session support. Two real harmless CLI probes returned the requested token. This proves programmatic delegation, **not** arbitrary sandbox penetration resistance or successful product implementation.

DOT uses `codex exec --ignore-user-config --ignore-rules --ephemeral --skip-git-repo-check --sandbox read-only --json`, stdin and JSONL capture. Shell/unified-exec, plugins/apps and web search are disabled for this supervisor-test adapter. Existing local MCP names include laya_local/cua_repl/node_repl; DOT neither depends on nor activates them. No API key is copied or printed. Authentication remains owned by the CLI's existing login store.

Reference: [official non-interactive documentation](https://developers.openai.com/codex/noninteractive) and [configuration reference](https://developers.openai.com/codex/config-reference). Local CLI help is the source for installed flags. Raw JSONL/tool outputs are not persisted; only sanitized final reports, status and usage are retained.

## Architecture

- `dot/planner.mjs`: reads/fingerprints all source-of-truth docs and relevant 082–084 decisions, parses roadmap A onward; selects **A completion review**, never B from a prior chat/self-report.
- `dot/policy.mjs`: strict budgets/default denial, redaction and test-failure classification.
- `dot/executor.mjs`: argument-array subprocess invocation, timeout/abort, JSON completion validation; source-only scratch snapshot and supplied-text review with tools disabled. No generic shell or owner-money action port.
- `dot/reviewer.mjs`: independent allowlisted local fixture-test/build commands, source fingerprints before/after, scoped Git diff, explicit fixture visual coverage. Read-only source review plus actual test evidence is required, not executor self-reported PASS.
- `dot/supervisor.mjs`: state/repair/verdict loop; initial review plus at most three narrow review repairs; one phase/run. This delivery repairs review/evidence criteria only, **not product source**. No auto-advance into B.
- `dot/state.mjs`: atomic state replacement, exclusive lock, sanitized artifacts and STOP.

State lives at `.dot/state.json`; each run creates `.dot/runs/<id>/` plan/task/executor-review/test summary/changed files/final summary. `.dot/` is ignored by Git. No commit/push implementation is active. Docs/current source hashes bind resume; resume repeats safe verification/review, not a remembered shell command or value-moving operation.

## CLI

From the repository root:

```powershell
node dot/cli.mjs status
node dot/cli.mjs plan
node dot/cli.mjs dry-run
node dot/cli.mjs run --dry-run
node dot/cli.mjs review
node dot/cli.mjs resume
node dot/cli.mjs stop
node dot/cli.mjs report
node dot/cli.mjs probe
node --test dot/dot.test.mjs
```

`plan` reads state/roadmap and emits a proposal without writes. `dry-run` loads docs and writes DOT state/artifacts; neither invokes Codex or tests. See current command branches above for actual run/review/resume semantics. `probe` is a separately explicit harmless real CLI call, consuming account usage. The original supervisor delivery installed no background job; the later user-context worker below is now available.

`dot/config.example.json` documents defaults. Optional `.dot/config.json` may opt into SUPERVISOR_TEST with supervisorValidated=true **only after human validation**. This permits independent tests/build and read-only Codex review of Phase A, not source edits or B. This task did not enable it. Changing allowImplementation/production/real-money/autoPush/autoCommit to true fails closed rather than silently enabling a new capability. maxParallelAgents=3 is a ceiling; current implementation is sequential, one review writer, no concurrent product edits. timeout is bounded. External rate/auth failures stop; no blind model-call retries.

States: PENDING → PLANNING → REVIEWING / REPAIRING → COMPLETE, HUMAN_GATE or BLOCKED. IMPLEMENTING is reserved and unavailable in this delivery. COMPLETE requires source review, focused/regression/build/fixture visual evidence, contract/safety verification and no source changes. Fixture self-tests never certify the real repository phase. A missing visual fixture yields UNAVAILABLE, not invented PASS.

## Human gates and security boundaries

Deployment/SSH/VPS, production data/migration, custody/secrets, wallet signing/approval/broadcast, launch/funding/withdrawal, trading activation, kill/emergency changes and destructive data operations are not implemented actions. Stop with HUMAN_GATE: state records reason; proposed action, rollback, risk and test evidence must be reviewed by a human before a separately scoped workflow. A human gate is not permission for DOT to execute those actions later.

Scratch snapshots exclude env/data/vault/SQLite/migration output. Selected source/docs are public development inputs, not production state. Model review receives sanitized excerpts and actual evidence; missing excerpt/import context must block or request review repair. Prompt policy is **not** a claim that read-only sandbox alone protects arbitrary external reads/network. Tool-disabled review reduces that surface; autonomous product-writing sandbox validation remains a future gate. Never run an agent with danger-full-access as a workaround.

STOP prevents new work. Current safe read-only subprocess may finish, then no next task starts. Ctrl+C aborts subprocess and leaves STOP/state. To resume, inspect state/lock first and manually remove `.dot/STOP` only when intended. A stale LOCK after hard termination is retained: inspect its PID and verify the process has stopped before manually removing that exact lock. DOT never kills unrelated processes or deletes project data. Unknown/malformed state/config is a blocker, not a reason to reset history.

No model output is a trusted command. Test execution uses fixed argv, sanitized child environment, no production API startup. All inherited secrets are excluded. Source mutations during verification cause HUMAN_GATE; current dirty user edits are compared against the run's baseline, not erased.

## Initial proposed task

Review/reverify Phase A completion, including the reported **TEST_ENVIRONMENT / CLIENT DEMO** Phantom fix. The local report says it passed; DOT does not infer current certification from that report. Check identity-only/coin=null, registry mapping and effective 10% ceiling, read-only lifecycle/plan, public/owner projections, focused suite, full isolated suite/build and chooser fixtures at 1440/390. Do not reinstall the historical blocker, change auth, fabricate results or jump to B.

Cost: at most one phase, three review repairs, bounded subprocess timeout. Real review is an account-usage event; normal dry-run has zero model calls. Interrupted work reuses docs/source evidence only when fingerprints still match. Excerpts reduce input, but original docs are always loaded/fingerprinted. No automatic phase completion is asserted by the initial dry-run.

## Phase 2 local proof — 2026-09-30

Real fixture run `b0d07375-1da9-4c77-a222-32b70fb3ac9f` completed: two real file-writing executor invocations, separate reviewer REPAIR then PASS, one repair cycle, six final fixture tests PASS and supervisor acceptance PASS. A further independent read-only reconciliation bound the final snapshot; five calls in that fixture journal. The earlier native-sandbox configuration probe was BLOCKED with no file changes and remains archived as `66151a51-7679-4ce2-84ec-8b69a0f75e8b` (one call). Total including the real read-only rehearsal: **seven Codex model invocations**. This excludes CLI help/config inspection, which does not call a model.

Rehearsal `077896cb-b8bc-465b-82db-4736b4530c6c` finished with focused/full/build/browser fixture gates PASS and zero product mutations. Independent verdict **REPAIR_NEEDED**, not Phase A certification: qualify legacy-schema semantic preservation, qualify receipt/token/configuration revision conflicts, and complete reviewer evidence (some supplied sources were excerpted). Production inventory remains separately human-gated. Exact findings/proposed task are retained in `.dot/runs/077896cb-b8bc-465b-82db-4736b4530c6c/rehearsal-final.json`; no proposed repair was executed and Phase B was not started.

DOT unit/state-machine regressions: **36/36 PASS**, including an actual interrupted disposable Node subprocess mutation followed by no-write reconciliation/review. Actual fixture was re-tested after pure-code AST guarding and remained PASS. Existing full product suite and Vite build PASS; the existing large-chunk warning is non-fatal. Subsequent fingerprints showed only DOT/docs changes, no product source changes. No commit, push, production access or real-money action occurred.

## Archane normal-user worker — 2026-09-30

[Queue/startup contract](ARCHANE-WORKER.md) and [decision091](decisions/091-archane-normal-user-local-worker.md).
Hidden Startup under non-elevated `bachira\budir` is installed. The fixed file
queue preserves existing DOT policies; it is not an alternative executor.
Actual STATUS/PLAN and RUN FIXTURE completed through that background context.
A harmless Codex probe and four structured fixture invocations proved executor,
independent REPAIR/PASS review and one repair cycle. Protected product source and
canonical DOT state hashes remained identical. Phase B was not invoked.
Evidence: `.dot/runs/worker-context-validation/validation.json` and the exact
UUID results under `.dot/control/results/`. Latest DOT regression suite: 107 PASS;
Vite native-config build PASS. Production, custody and real-money remain denied.
