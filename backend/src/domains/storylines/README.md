# Storylines

Backend foundation for data-driven Econovaria storylines.

The current implementation includes schema/contracts, the evaluation-only
condition engine, an effect execution foundation, Supabase repository layers, a
runner foundation, and backend story notification delivery foundations. The
condition engine accepts parsed story conditions and a normalized backend
`PlayerStoryContext`, then returns a boolean. The effect engine accepts parsed
story effects and injected ledger, policy, flag, and impact dependencies. The
repositories own database access for storyline activations, event candidates,
idempotent event resolutions, player impacts, policies, story flags,
notifications, and per-player notification deliveries. The runner composes the
story pieces to resolve eligible candidate events, apply player-rule effects,
and optionally create cutscene notification deliveries through an injected
notification repository after an idempotent resolution insert. It is still not
wired to an HTTP handler, scheduler, frontend, realtime publisher, market
runner, dashboard snapshot, or modal UI path.

Deferred work:

- story runner HTTP/scheduler integration
- policy enforcement
- notification delivery endpoints and dashboard snapshot integration
- dashboard/frontend cutscene UI
- admin story authoring tools
- story content
