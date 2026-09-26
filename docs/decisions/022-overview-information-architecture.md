# 022 — Overview is the primary operational dashboard

## Status
Accepted. 2026-09-27. Corrects the navigation presentation of 021, not its data model.

## Decision
Primary navigation is Overview, Agents, Tokens, Characters, Guide. Trading,
leaderboard and payroll routes remain secondary expanded views. Overview reads
the existing network, leaderboard and owner-scoped payroll endpoints; no second
event source, execution engine or metric store is introduced.

Network projection adds original agent creation time, launch-token display name
and symbol, and confirmed receipt presence for New Hires. Unreadable receipt
state is unknown, never advertised as live. Custody data remains excluded.

## Limits
Employee of the Month is explicitly labelled all recorded Paper history: monthly
return snapshots do not exist. Sparklines are omitted because portfolio history
is not stored. Payroll stays owner-scoped; global statistics/activity are public.
Live execution remains locked. No launch, signing, risk or execution changes.
