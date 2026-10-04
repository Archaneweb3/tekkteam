# 085 — DOT supervisor-test boundary

## Status

Local dry-run supervisor implemented, 2026-09-30. Not authorization to modify product phases or deploy.

## Context

The user requested a development supervisor that removes report copy/paste while preserving all TEKKTEAM safety boundaries. Installed Codex CLI has verified non-interactive JSONL delegation and existing ChatGPT authentication. The project is a dirty working tree with sensitive local persistence; unrestricted agent execution against it is inappropriate. Phase A reports exist but must not be mistaken for fresh evidence.

## Decision

Ship DOT as a separate Node CLI with dry-run defaults, persisted redacted state, exclusive lock, bound resume, STOP and bounded review repairs. The initial task is Phase A completion review, not B. Source-of-truth docs are loaded/fingerprinted; reports are hints only. Actual completion requires independent allowlisted local tests/build plus source review and unchanged safety/source evidence.

Use source-only scratch snapshots and tool-disabled read-only Codex text review, not inherited local MCP/plugins or arbitrary shell commands. Preserve the CLI authentication store without copying credentials. Product-writing delegation and phase advancement remain unavailable until separately implemented/reviewed/authorized. Independent analysis may be parallel; current runtime is sequential under the configured ceiling.

## Alternatives

Reject unrestricted codex execution in the live checkout, trusting executor self-reported PASS, global trading/production permissions, blind session resume and automatic Git writes. Do not pretend a harmless echo probe certifies a complete security sandbox or an autonomous implementation loop.

## Consequences

DOT planning/state/delegation and review state machine can be validated now without product changes. Autonomous product edits are not delivered/activated by this initial supervisor boundary; future write/repair promotion needs separate safe staging and authorization work. Production/real-money/custody/signing remain explicit human gates. This decision does not alter Phase A contracts, product UI, flags, persistent databases or production.
