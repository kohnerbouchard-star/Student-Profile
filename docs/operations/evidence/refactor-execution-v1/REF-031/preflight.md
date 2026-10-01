# REF-031 Countries reference-read separation

Status: IN_PROGRESS. Base main `87bb58889c4412db023c3ccf858b116630bf77b0`.
REF-016 is complete. Current open owners cover Contract progress (#785), Player
binding/context (#736/#668), release/CSS/docs; none owns this Countries seam.
REF-029 integration is serialized by the controller. Preserve REF-015/025 blocks,
REF-019/020 pauses and REF-027's unmet REF-025 prerequisite.

## Exact scope and ownership

Seven meaningful paths: existing
`backend/src/domains/countries/infrastructure/supabasePlayerWorldReadRepository.ts`,
its adjacent registered test, proposed `supabaseCountryReferenceReads.ts` in that
same directory, this record, REF-031 task, only REF-031's backlog entry, and the
exact-PR cross-cutting authority manifest. Generated architecture inventory is
listed separately. Ten-file task ceiling and 400-semantic-line review threshold.
No handler/service/public DTO, SQL, schema/seed, package, workflow, auth, FX,
travel, country identity/name/border or map changes.

Schema/source classification of every repository entity:
- `country_profiles`: GLOBAL_REFERENCE. Global ID/code/currency and active status;
  no game key (20260621004500 country foundation).
- `country_economic_snapshots`: GAME_SCOPED. Required game foreign key and scoped
  country/sequence/effective-time projection from the same foundation.
- `player_country_assignments`: PLAYER_SCOPED. Required game and Player composite
  foreign key, country reference and assignment lifecycle in that foundation.
- `stock_market_events`: GAME_SCOPED. Required game foreign key, visibility/active
  and tick cursor filters (20260623093000 market foundation).
No TEMPLATE or SYSTEM_RUNTIME entity is read by this repository.

Move only two global country-profile query builders into an internal reference
helper. The current repository retains mapping/error handling and all mutable
queries with game/Player predicates inside SQL. Keep exact selected columns,
active filter, ID batching, name order, limits, null behavior and query scheduling.
List performs one snapshot query then parallel reference/assignment reads; empty
snapshot history skips reference lookup. Detail performs reference/assignment in
parallel then one scoped snapshot query only when reference exists. News stays
unchanged. Existing `PlayerWorldReadRepository` is the narrow consumer contract;
no extra public port or country authority is needed.

## Qualification plan

Extend the already registered adjacent repository tests before extraction:
two games sharing one reference with different scoped snapshots/assignments,
missing reference, empty history/news, query failures and limits/order/count.
Run backend player-world/world-runtime, Player world-news-route/world-runtime/
map-protection, privacy/security, typecheck/smoke, architecture and repository
checks. Existing locked tooling and permissions remain unchanged. Publish a
scope-only draft first to bind its exact PR authority; then publish tested code.
No completion or runtime deployment claim before review and required CI.

Characterization: baseline Player World 17, World runtime 37+11, and all three
Player commands passed. Six added repository parity cases pass before extraction
(Player World 23) and after it (23); unchanged World runtime 37+11, Player security
59 and backend TypeScript pass. Generated inventory adds one source file
(1258→1259, Countries 12→13); all debt counts remain unchanged. Initial combined
architecture command stopped on its expected generated-file diff; the staged
regeneration is retained and ratchets are rerun without changing any ceiling.
