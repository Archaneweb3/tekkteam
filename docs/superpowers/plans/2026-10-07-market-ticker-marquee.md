# Market Ticker Marquee Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Read-only Overview marquee showing DexScreener Solana/Pump trending tokens (symbol, USD, 24h %).

**Architecture:** Server-proxied DexScreener boosts + token pairs → `GET /api/market/ticker` → Overview CSS marquee.

**Tech Stack:** Node ESM server, existing `fetch` DI pattern, vanilla Overview JS/CSS.

## Global Constraints

- No signing, broadcast, funding, Live, or custody changes.
- Economic rows must carry DexScreener provenance; never fabricate prices.
- Overview only; click → DexScreener new tab.

---

### Task 1: Ticker service + tests

**Files:** `server/market-ticker.js` (new), `tests/market-ticker.test.mjs` (new)

- [x] Failing tests: Solana filter, pump venue preference, 24h mapping, cache, 429/unavailable
- [x] Implement `createMarketTicker({fetcher,now})`
- [x] Pass tests

### Task 2: HTTP route

**Files:** `server/app.js`, optionally small install helper in `server/market-ticker.js`

- [x] `GET /api/market/ticker`
- [x] Allow path in `public/app/backend.js` detached allowlist if needed
- [x] Route test via `createServer` + fixture fetcher if injected; else unit-level + smoke

### Task 3: Overview marquee UI

**Files:** `public/app/market-ticker-ui.js` (new), `public/market-ticker.css` (new), `public/app/overview-dashboard.js`, CSS link in workspace shell/index

- [x] Render marquee from API
- [x] Wire into Overview mount/refresh
- [x] Unavailable / empty states

### Task 4: Verify

- [x] Run ticker tests + relevant overview/smoke checks
