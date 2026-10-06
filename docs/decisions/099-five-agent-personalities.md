# 099 — Five bounded momentum personalities

6 October 2026. Implemented locally; Real execution remains disabled.

The owner's product specification sets Guardian, Scout, Operator, Hunter and
Berserker to 5/7.5/10/15/20 percent of tradable SOL, TP 4/5/6/8/10 percent,
SL 2/2.5/3/4/5 percent and entry cooldown 1800/1200/600/300/180 seconds.
Operator is the default for new Agents. Legacy selective/balanced/momentum and
existing position configuration remain unchanged.

These are five profiles of the existing deterministic momentum/activity engine.
Version 1 thresholds are engineering choices, not owner-supplied market numbers:
minimum momentum 1.5/1/.75/.5/.25 percent, maximum 5/8/10/15/20 percent,
buy/sell ratio 1.8/1.5/1.25/1.15/1.05, volume 1500/1000/750/600/500 USD,
liquidity 30000/25000/15000/12500/10000 USD. The nested ranges provide strict
through broad entry behavior. Version 1 definitions must remain immutable.

Sizing uses integer lamports after reserve and is capped again by independent
configured and execution limits. No personality raises the existing Real
100000-lamport ceiling. Real sizing requires a fresh verified account/cost plan;
missing or stale proof denies entry. The final amount is quoted and reserved again
by the existing execution path. Paper uses its declared simulated cost model.
Those results do not qualify Pump market execution or real reserve adequacy.

Entry cooldown cannot delay protective SELL. Existing position TP/SL use their
entry-time policy snapshot. Save/configuration never arms trading, signs or sends.
