# 075 — Agent Overview follows the Home layout contract

Status: Accepted

## Context

Agent Detail → Overview had accumulated its own visual grammar: repeated KPI facts, competing panel treatments, dense activity cards, and chart controls better suited to Performance. It no longer read as a child of the Home workspace. A narrow visual adjustment would preserve that fragmentation.

## Decision

Overview uses the existing `#tw-page` width and the Home typography, color, action-link, and panel vocabulary. Its content follows a twelve-column grid with a 24px gutter, 48px major-section spacing, and 24px filled-panel padding. Only Current Position and Performance are filled panels. Agent Status and Recent Activity remain open sections. At desktop the panels span eight and four columns; at tablet seven and five; on mobile they stack. Each material fact has one primary presentation. Overview shows a compact, recorded-data-only equity trend; detailed ranges and methodology remain in Performance. Activity is a concise list with human-readable reasons and a route to the full tab.

The Agent Hero and all other Agent tabs remain outside this decision. Overview continues consuming the existing trading and analytics projections; no Paper/Real accounting, lifecycle, strategy, or backend behavior changes.

## Consequences

The page gains a measurable shared layout contract rather than a separate `aw-*` design island. Desktop/mobile browser assertions check the grid, spacing, panel count, chart gaps, and tab navigation. Missing or ambiguous token symbols fall back to a verified name or shortened mint instead of displaying a misleading symbol. Historical chart gaps remain gaps; no values are fabricated.
