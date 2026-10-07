# Market ticker marquee — design

**Status:** Approved for implementation (user 2026-10-07)  
**Surface:** Home / Workforce Overview only  
**Mode:** Read-only market display · no trading, signing, funding, or Live activation

## Goal

Show a moving marquee at the top of the Overview with trending Solana / Pump.fun tokens: symbol, USD price, 24h percent change. Click opens DexScreener in a new tab.

## Requirements

| Item | Choice |
|------|--------|
| Universe | Trending Solana / Pump.fun (DexScreener boosts + liquid pairs) |
| Change window | 24h (`priceChange.h24`) |
| Placement | Overview only (not global shell) |
| Fields | Symbol · price USD · 24h % |
| Click | DexScreener pair URL · `target="_blank"` · `rel="noopener noreferrer"` |
| Provenance | Explicit DexScreener / BACKEND VERIFIED · never fabricate prices |
| Failures | Empty/unavailable state or stale cache label · never invent rows |

## Architecture

1. `server/market-ticker.js` — DexScreener `token-boosts/latest/v1` → Solana mints → batch `latest/dex/tokens/{mints}` → prefer `pumpfun` / `pumpswap` venues (then other known Solana venues by liquidity). Cache ~45s.
2. `GET /api/market/ticker` — public GET, read-only DTO.
3. Overview UI marquee — CSS scroll, mounted only in `overview-dashboard`.

## Out of scope

Global shell, sparklines, market cap, client-side DexScreener calls, Live/trading hooks, deploy.
