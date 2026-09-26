# Allowlisted local Mainnet RPC transport

Status: Accepted for local diagnostics only
Date: 2026-09-26

## Context
The public Mainnet RPC accepts the server request but returns HTTP 403 when the local browser Origin is present. Transaction construction already passes simulation and must not change. Mainnet safety mode must not acquire a broadcasting capability.

## Decision
Use a separate loopback-only transport on 4191, exposed to the local Vite origin at /mainnet-rpc. Validate loopback remote address, Host, Origin, content/body size, JSON-RPC shape and seven allowed read/simulation methods. Reject batches and user-selected upstream URLs. Limit requests to 60/minute and two concurrent operations. Verify Mainnet genesis on every call. Only the existing fixed unsigned Memo may be simulated or fee-quoted. Retain the exact input bytes; no blockhash/fee-payer/instruction replacement. No secrets or wallet keys are used. No submit adapter exists.

## Consequences
This is a development-only backend transport, not a public production proxy. Public deployment requires authenticated access, configured origins, provider capacity and deployment review. Transaction helpers, Devnet evidence, production broadcast settings and existing backend remain unchanged. A resolved signTransaction result is discarded; it does not cause broadcast or justify enabling production execution.
