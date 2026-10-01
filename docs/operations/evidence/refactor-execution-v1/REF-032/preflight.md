# REF-032 World runtime read boundary verification

Status: IN_PROGRESS. Base main `eabf3d032768771ebdee652a9d6d1ce35d655734`.
REF-031 is complete. REF-029 owns separate Contract work; no overlapping World
read owner exists. Preserve blocked REF-015/025/027 and paused REF-019/020 gates.

## Existing application owner and exact scope

Verification-only disposition: `createPlayerWorldRuntimeService.readContext(scope)`
already invokes one injected `PlayerWorldRuntimeRepository.readSnapshot` and a
pure public projection. The existing clock is explicit for commands; this read
is revision-driven and never calls it. No additional service/port is warranted.
The edge adapter composes the existing repository/service; both routers retain
reviewed rate-limit dispatch and server-derived Player session scope.

Six meaningful paths: proposed adjacent
`backend/src/domains/world/infrastructure/supabasePlayerWorldRuntimeRepository.test.ts`,
one registration import in existing `world/services/playerWorldRuntimeService.test.ts`,
this record, REF-032 task, only its backlog entry, and the exact-PR authority
manifest. Generated architecture inventory is separate. Twelve-file ceiling,
400-semantic-line threshold. No runtime, SQL, schema/seed, campaign policy,
travel/decision, currency/rate, UI, package, workflow or credential edits.

## Returned fields, owners and query boundary

- Arrival owns private assignment/class/score facts; the public read strips
  ownership IDs. Questionnaire definitions are shared constant reference data.
- Campaign owns the selected game instance, executions/history and affected
  locations. Public history is sequence-filtered, ordered and capped at 50.
- World owns game runtime revision, ordered location/route projections and their
  persisted cost/duration multipliers; the read does not recompute policy.
- Player-scoped travel, optional journey and residency retain both game and
  Player predicates; internal journey identity is translated to its public key.
- No separate Countries reference lookup is performed by this selected read.

The canonical aggregation repository performs seven parallel initial reads:
arrival_class_assignments, player_travel_states, player_residency_states,
world_runtime_instances, world_location_states, world_route_states and the first
created campaign_instances row. Optional journey adds one scoped read; campaign
history/effects add two parallel scoped reads. Total fan-out remains 7–10.
The 20260721100000 World runtime migration and subsequent bindings establish
these game/Player owners. No selected cross-domain infrastructure import exists.

Missing optional runtime/campaign rows remain null; query errors reject rather
than invent state. Paused games currently fail the session helper's active-game
lookup (status disabled), while a paused campaign inside an active game remains
readable. Both existing behaviors are preserved. Arrival/travel/residency command
methods and their atomic mutations remain outside the selected read operation.

## Missing evidence and qualification plan

Add bounded tests through the actual repository, service and HTTP read path with
an instrumented query client that rejects all writes/RPCs. Cover two games with
a shared definition and different state, exact scope/batching/order/count,
missing/optional branches, current revision freshness, dependency failure,
private-field projection, campaign pause, and denial before World reads.
The existing owning module imports the new test without changing frozen package
scripts. Run World/Countries, privacy/capability and Player route/runtime suites,
shared audits/typechecks and required exact-head CI. No completion claim until
qualified merge and merged-main verification.

Local qualification: thirteen added cases pass through the actual read pipeline
(World runtime 50 + 11 tests). Countries 23, Player security 59, capabilities 11,
backend TypeScript, Player World runtime/news/map commands pass. New test
registration changes no package script. Inventory adds one test/source file
(1259→1260; World 18→19); debt counts are
unchanged; tests use the existing Players public index. Full Edge typecheck/smoke are not rerun locally under the known pinned
esm.sh dependency connection refusal; exact-head CI must provide both gates.

Draft [PR790](https://github.com/kohnerbouchard-star/Student-Profile/pull/790)
binds its exact-path authority at `docs/operations/contracts/player-cross-cutting/pr-790.json`.
Seven changed paths comprise six meaningful files plus generated inventory.
Verifier/test paths are locked and unchanged. Final owning World suite still
passes 50 + 11, including all optional dependency error branches. Shared audits,
root npm test and diff checks pass; no architecture ceiling is changed.
