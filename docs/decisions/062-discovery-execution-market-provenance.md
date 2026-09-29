# 062 — Bind discovery markets to verified execution pools

## Context

The Live scanner received a token-level Dexscreener quote with a reported pair and venue, while the CPMM execution adapter accepted only one hard-coded, independently verified WSOL/USDC pool. The scanner did not carry the pair's second mint and looked for a `pool` field the feed never supplied. A strategy BUY could therefore neither prove it had analyzed the same market the executor would trade nor reach Risk.

## Decision

Keep Dexscreener as market-data input, not venue authority. Carry the reported pair, base/quote mints, venue, source, timestamp, and snapshot ID as an explicit MarketIdentity. After Strategy emits BUY, a read-only resolver accepts only the known Raydium CPMM pair containing USDC and WSOL (in either reported orientation) and independently loads the complete Mainnet pool state through the existing fenced CPMM provenance path. It returns a binding to the exact discovery snapshot and verified pool. Unsupported or incomplete identities fail closed before Risk.

The BUY intent includes that binding; the execution port rechecks it against the unchanged strategy snapshot and persists it with the canonical intent. The adapter independently re-fetches pool state, quote, and validation during execution; a discovery binding never authorizes value movement or substitutes an indicative price for a local executable quote. Runtime decisions expose the analyzed token/pair and supported venue/pool separately. Paper radar facts expose unsupported execution status unless an independently verified binding exists.

The known pool is reported by Dexscreener with WSOL as base and USDC as quote and may be omitted from token-level top-pair lists. A named-pair read-only feed can represent that precise market without inventing a pool or silently replacing its price. Its current low liquidity or missing 5-minute momentum may still yield Strategy SKIP; provenance support is not a BUY signal.

## Consequences

The V1 executable universe remains the single proven CPMM pool. A random discovery scan need not contain it. Mainnet RPC availability and fresh, strategy-complete market facts are still necessary before any real autonomous acceptance. Live, funding, withdrawal, and signing gates remain separate and closed by default.
