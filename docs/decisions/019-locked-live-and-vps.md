# 019 — Same-origin VPS and locked custody execution

## Status
Accepted for locked deployment preparation; live DEX execution not approved.

## Context
Paper execution is verified but cannot justify exposing custodial signing or
assuming its synthetic slippage model is valid for a real DEX.

## Decision
Deploy same-origin HTTPS with private API/launch services, explicit secrets and
persistent storage. Preserve launch transaction construction. Funding is a
separate default-off user-signed exact-message operation with a durable send latch.
Live execution remains an unconditional rejection until its adapter is reviewed.

## Consequences
Paper and launch remain independently usable. VPS provisioning, secrets, TLS,
restore checks and a real approved funding test are still operator gates.
No boolean environment flag alone can unlock agent signing.
