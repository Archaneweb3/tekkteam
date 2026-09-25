# ADR-003: Position TEKKTEAM as an AI-agent product, not a character studio

## Status

Accepted

## Date

2026-09-25

## Context

The initial prototype emphasized its 3D world and described its avatars as a creative crew. The product owner clarified that TEKKTEAM is a website about AI agents. The avatars are visual representations of agent roles, not the product itself.

## Decision

Lead with six specialized AI agent roles throughout the UI. Explain that the 3D characters visualize those roles. Distinguish planned AI workflows from the front-end preview that currently exists. Do not label agents as online, operational, or trading until a corresponding backend and verification exist.

## Alternatives considered

- **Keep character-first marketing:** visually attractive but misidentifies the product.
- **Claim active autonomous agents now:** misleading without task execution, external tool connections, and operational evidence.

## Consequences

- Product copy describes AI-agent roles and planned workflows while clearly marking unconnected features.
- Future agent integrations should include observable task state, user approvals for consequential actions, and explicit failure handling before operational claims are made.
