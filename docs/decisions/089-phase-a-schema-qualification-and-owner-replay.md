# 089 — Phase A schema qualification and owner-bound identity replay

## Status

Accepted, 2026-09-30. Local qualification only; no production deployment or schema apply.

## Context

The operator supplied a read-only production inventory: SQLite user_version 2, nullable agents.secret, unique Agent IDs, requests primary key (owner,key), and Agent Wallet/Paper foreign keys to agents(id). Revision/publication objects are absent. This assistant did not independently retrieve the inventory; its provenance is OPERATOR_SUPPLIED. Trigger definitions were not supplied, but the already-nullable production path performs no schema rebuild, so no trigger/index reconstruction is necessary.

The identity request lookup was owner-scoped, but its replay Agent query used only the referenced ID. A corrupted or inconsistent request association could return another owner's Agent, or null. This is not a grant of production writes.

## Decision

Bind replay Agent lookup to both persisted request Agent ID and authenticated owner; fail 409 for missing rows, malformed JSON or inconsistent embedded ID/creator. Never recreate a missing Agent on replay, fabricate a token/mint, or leak the foreign Agent. Changed intent remains 409; two owners may use the same request key independently. Existing combined Devnet creation, authentication, custody and transaction paths are unchanged.

The production V2 nullable schema is already compatible: ensureIdentitySchema returns without rebuilding/writing it. Preserve Agent IDs, Wallet/Paper references, request ownership and all history. No custody migration/backfill is needed. Tests use synthetic disposable records only, not production row/key material.

## Additive storage design — PLANNED, not implemented

Proposed `agent_configuration_revisions`: composite identity (agent_id, revision), owner, schema_version, registry_version, preset_id, configuration_json, configuration_hash, created_at; agent_id references agents(id). Future risk-revision linkage is nullable until independently recorded, never fabricated for legacy snapshots. Append new revisions only, validate ownership through the canonical Agent and owner-scoped queries, retain entry-time snapshots unchanged. Source-versioned registry definitions remain separate from runtime authorization.

Proposed `agent_publications`: agent_id primary key referencing agents(id), owner, publication_version, explicit enabled state, allowlisted public metadata, created_at/updated_at. No custody/capability/message/session material; enabling publication never starts a capability or proves launch confirmation. Publication lifecycle needs a separately approved write contract and concurrency policy. Public feed remains unavailable until implemented; pure projection fixtures are not a publication database.

Neither proposed name conflicts with the operator's reported absence of revision/publication objects. No tables are created in this task. Future apply must be separately authorized, additive and fixture-qualified, preserve immutable history, and never replace current databases. Rollback disables new consumers/returns to existing serializers; it does not delete historical revisions, rewrite old snapshots, or restore Devnet secret material.

## Consequences

This evidence certifies structural compatibility and local safety behavior, not production row-level integrity, freshness or deployed runtime activation. Paper stays Paper; Operating Plan/lifecycle/public projections remain read-only/allowlisted; exposure remains the existing effective 10% ceiling. No Phase B, SSH, production DB mutation, deployment, wallet transaction, signing or broadcast is performed.
