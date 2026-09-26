# Simulation-verified estimated spending policy

Status: Accepted for isolated unsigned Mainnet readiness; supersedes ADR 017's absolute-proof prerequisite for this controlled simulation only
Date: 2026-09-26

## Context
The user explicitly replaced the absolute static debit guarantee with an estimated spending threshold of 10,000,000 lamports. Static transaction and account validation must remain intact. Signing and broadcasting remain prohibited.

## Decision
Add an opt-in unsigned simulation path using the unchanged builder and inspectCreation validator. Simulate exact bytes without blockhash replacement. Require same-slot before/simulation/after reads and unchanged real account data; inspect CPI programs, operation types and destinations; reconcile payer debit with account credits and network fee. Fail closed on errors, missing evidence, unexpected behavior or an estimate above the threshold.

## Consequences
Passing is labeled Simulation-verified estimated spending limit, never an absolute on-chain cap. This permission applies to simulation only. Historical evidence and the older static guard remain intact. No production RPC proxy, signing endpoint or broadcast worker is enabled. A future signing stage must revalidate fresh evidence and obtain separate authorization.
