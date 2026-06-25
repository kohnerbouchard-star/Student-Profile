# Storylines

Backend foundation for data-driven Econovaria storylines.

The current implementation includes schema/contracts plus the evaluation-only
condition engine. The condition engine accepts parsed story conditions and a
normalized backend `PlayerStoryContext`, then returns a boolean. It does not
load player state, run story events, apply effects, write impacts, create ledger
entries, mutate policies/flags, publish realtime events, or deliver
notifications.

Deferred work:

- story runner scheduling and event resolution
- ledger-backed cash effects
- policy enforcement
- notification delivery endpoints
- dashboard/frontend cutscene UI
- admin story authoring tools
- story content
