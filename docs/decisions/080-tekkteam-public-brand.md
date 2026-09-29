# 080 — TEKKTEAM public brand, stable technical namespace

Status: Accepted

## Context

The product name changes from TEKKWORK to TEKKTEAM. The existing technical namespace appears in persistent database paths, cookies, browser storage and events, deployed metadata URLs, service names, historical receipts, and cryptographic/audit material. Renaming those identifiers would risk lost sessions, inaccessible records, or mismatched transaction evidence without improving the visible brand.

## Decision

Change current user-facing copy, wordmarks, accessibility labels, browser titles and metadata, server-reported brand, and newly issued wallet sign-in challenge text to TEKKTEAM. The verifier checks the exact stored challenge message, so outstanding TEKKWORK challenges remain verifiable until their normal expiry. Do not rewrite old challenges or sessions.

Keep `tw_session`, `tekkwork.sqlite`, `TekkworkSDK` and related JavaScript contracts, `tekkwork:*` storage/event names, asset filenames, historical token metadata, on-chain memo/test strings, deployment service paths, and existing domains/URLs. They are compatibility or historical identifiers, not current display labels. The production domain remains undecided; no replacement host is inferred.

## Consequences

Owners see TEKKTEAM without changing wallet ownership, custody, transfer semantics, trading behavior, or stored history. A future domain migration needs a separate origin/CORS/auth/deployment plan and explicit domain decision.
