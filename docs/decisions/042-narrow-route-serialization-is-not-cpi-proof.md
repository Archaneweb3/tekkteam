# 042 — Narrow route serialization is not CPI proof

## Context

The smallest captured route is one Deriverse leg inside Jupiter `route_v2`.
Its 44-byte top-level payload can now be decoded using a current on-chain-published
Anchor IDL, instead of inferring offsets from a quote. However the IDL describes
remaining accounts only implicitly. Eight downstream writable roles and the actual
Jupiter-to-Deriverse CPI implementation remain unproven.

## Decision

Add an **observation-only**, explicitly versioned single-Deriverse decoder pinned
to IDL raw SHA256 `cf5b1abb503ba25caf3423a89e29c7aa127c44867fabe6a22e143c554d813b7d`.
It fully consumes the payload, checks the top-level account roles against derived
Agent ATAs, and rejects unsupported shapes/fees/schema/encoding. Every return
remains `supported:false`, `executable:false`. It is not registered in the
production route validator or executor. Approved CPI/program sets remain empty.

Pin the independently derived Anchor IDL address, RPC owner, discriminator,
authority, compressed bytes and decompressed content hash as historical evidence.
The IDL authority differs from program upgrade authority; neither publication nor
a deployment hash equates to an audited source-to-binary binding. Record current
Jupiter and Deriverse ProgramData fingerprints without approving those binaries.

Do not pretend the current provider threshold is proved by the IDL. For quoted
12224 units and 100 bps, floor arithmetic produces 12101 while the provider's
threshold is 12102. Actual on-chain rounding/enforcement requires implementation
evidence. Do not silently reduce the expected threshold or normalize instructions.

## Consequences

No additional builds are requested merely to fish for a passing route. The user
requires new sampling after a supported narrow policy; that condition is not met.
Do not wire a production adapter, restart unrelated services, touch frozen systems,
enable flags, fund, or sign. Runtime remains unchanged and disabled.

Capital can be reported only as conditional arithmetic until a safe executable
input floor is proven. Both current canonical ATAs are absent; current peak rent
is included even though WSOL rent would be returned. The existing reconciliation
margin is already part of protected reserve, not double-counted. A historical
100000-lamport quote is an example, not a recommended/safe minimum input.

## Verification

37 new offline tests cover graph integrity, complete narrow serialization,
top-level mutations, on-chain IDL fixture reproduction, and capital arithmetic.
They do not claim a supported full-route mutation matrix. See the narrow-route
checkpoint for exact open proof obligations. No real transaction was performed.
