# Storylines

Backend foundation for data-driven Econovaria storylines.

The current implementation includes schema/contracts, the evaluation-only
condition engine, and an effect execution foundation. The condition engine
accepts parsed story conditions and a normalized backend `PlayerStoryContext`,
then returns a boolean. The effect engine accepts parsed story effects and
injected ledger, policy, flag, and impact dependencies. It has no direct database
access and is not wired to a runner, scheduler, frontend, realtime publisher, or
notification delivery path.

Deferred work:

- story runner scheduling and event resolution
- policy enforcement
- notification delivery endpoints
- dashboard/frontend cutscene UI
- admin story authoring tools
- story content
