# 070 — Agent Detail uses five focused workspace tabs

Status: Accepted

## Context

Agent Detail rendered identity, Paper trading, strategy, analytics, wallet, Controlled Real, acceptance diagnostics and token launch in one long page. This made normal status and actions hard to locate, particularly on mobile, and presented developer-only controls as if they were everyday product actions.

## Decision

Agent Detail retains a compact identity hero and exactly five primary tabs: Overview, Trading, Performance, Activity and Settings. Only the selected tab's content is mounted. Overview summarizes Paper performance and real wallet state with explicit labels. Trading focuses on Paper scanning, decision, risk, position and Start/Pause; autonomous real trading is labeled PRIVATE BETA, never exposed as a normal Start action. Performance hosts the existing detailed analytics. Activity presents filtered decisions, trades and executions. Settings hosts saved strategy/risk, wallet and safety controls. Token launch and the Controlled Real/acceptance surfaces stay available behind collapsed disclosures in Settings, with their existing authorization and backend guards unchanged.

The visible tab, including review/error/action availability, is a presentation choice only. It never authorizes real-money movement. In particular, UNKNOWN signed executions remain subject to existing reconciliation and Emergency Stop remains available to the owner independently of a successful status read.

## Consequences

Navigation and mobile scanning improve without changing trading APIs or state machines. Existing browser tests must select Settings before exercising strategy or launch controls. The frontend must dispose timers and child components on tab change to avoid duplicate polling or stale updates.
