# 083 — Strategy foundation and authorization separation

## Status

Accepted product/documentation contract, 2026-09-30. Registry, projections and revised Launch UX are TARGET, not runtime implementation.

## Context

[Launch strategy research](../research/LAUNCH-STRATEGY-RESEARCH.md) proves three current profile IDs over one momentum/activity engine. Catalog exposure 5/10/15% conflicts with active default/ceiling 10%. Competitor Launch demonstrates behavior/operating-plan comprehension, not a reason to copy algorithms, parameters, UI or authorization semantics.

## Decision

Separate archetype, preset, risk configuration, execution mode and execution authorization. MVP honestly presents one behavior; TARGET Strict/Standard/Broad map to Selective/Balanced/Momentum filtering, preserving IDs. Exposure intent remains unresolved implementation debt; no limit change is approved.

Define a versioned StrategyArchetype/Preset registry with typed bounded schemas, immutable revisions and per-mode qualification. AVAILABLE/EXPERIMENTAL/PLANNED describe implementation, not execution permission. Trend and Recovery remain PLANNED until distinct backend/data/test evidence qualifies them. Custom is constrained supported configuration, never arbitrary code or prompt-controlled execution.

Launch strategy hierarchy is Behavior → Preset → Operating Plan → Capital/Risk → Advanced → Review. Operating Plan derives from actual configuration and effective policy. Configuration/token setup/launch/funding never implicitly enables trading. Proposals reference Agent, registry/configuration/risk revisions and mode; historical entry-policy snapshots are preserved.

## Alternatives

Reject fake strategy diversity, immediate runtime renaming, invented exposure defaults, arbitrary custom scripts, competitor-copy UI/parameters and AVAILABLE-as-authorization. Reject an independent frontend policy/catalog as authority.

## Consequences

PRD, SYSTEM, ARCHITECTURE, DESIGN and AGENTS distinguish current behavior from target contracts. Future implementation must unify catalog/schema and separately qualify modes while preserving custody, Risk, Mainnet, validator/simulation, expiry, reservations, claims and reconciliation. This supplements decision 082; current shared-config decision 029 remains the implementation evidence, not superseded by an unbuilt registry. No source code, schema, feature flags, production, service or transaction changes.
