# Storylines

Backend foundation for data-driven Econovaria storylines.

The current implementation includes schema/contracts, the evaluation-only
condition engine, an effect execution foundation, a Supabase repository layer,
and a runner foundation. The condition engine accepts parsed story conditions
and a normalized backend `PlayerStoryContext`, then returns a boolean. The
effect engine accepts parsed story effects and injected ledger, policy, flag,
and impact dependencies. The repository owns database access for storyline
activations, event candidates, idempotent event resolutions, player impacts,
policies, and story flags. The runner composes these pieces to resolve eligible
candidate events and apply player-rule effects, but it is still not wired to an
HTTP handler, scheduler, frontend, realtime publisher, market runner, or
notification delivery path.

Deferred work:

- story runner HTTP/scheduler integration
- policy enforcement
- notification delivery endpoints
- dashboard/frontend cutscene UI
- admin story authoring tools
- story content
