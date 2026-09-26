# Client presentation release

Status: Accepted
Date: 2026-09-26

## Context
The user requested a GitHub/Vercel release for a client presentation before public backend hosting is available.

## Decision
Production frontend builds explicitly use a read-only, empty demo state generated from public character and strategy configuration. The demo does not contact an API, open wallet authentication or submit transactions. It labels its limitations visibly. Development mode retains the local devnet backend.

## Consequences
This release is a public UI demonstration, not a functional public devnet beta. No private records, vault keys or environment files are published. When backend hosting is ready, replace the explicit production demo policy with a tested API deployment configuration and verify authenticated flows before enabling it.
