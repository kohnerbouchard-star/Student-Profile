# REF-031 Countries reference-read separation

Status: VERIFIED_COMPLETE. Base main `87bb58889c4412db023c3ccf858b116630bf77b0`.
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

Draft [PR788](https://github.com/kohnerbouchard-star/Student-Profile/pull/788)
binds `docs/operations/contracts/player-cross-cutting/pr-788.json` to these eight
changed paths (seven meaningful plus inventory). Verifier/test paths are locked
but unchanged. Root npm test and all shared audits pass after regeneration.
Local full Edge typecheck is BLOCKED by connection refusal fetching pinned
`@supabase/supabase-js@2.108.2` from esm.sh; no aggregate passing credit is claimed.
Exact-head CI must supply full backend typecheck/smoke and required cross-cutting
checks. Local focused tests and backend TypeScript remain passing.

## Qualified source and guarded merge

[PR788](https://github.com/kohnerbouchard-star/Student-Profile/pull/788) qualified
head `96d9f35e4b0a83bb1bcc83931e46cecf481efa21` and merged with an expected-head
guarded merge as `9bc6a00c341d8ee7d3b891191541a7111d703016`. Both trees equal
`45efcd612211c1d916db8638c8788645927bd320`. Independent review approved the
bounded query-builder extraction; no mutable projection, mapping, error, auth,
public contract or query-scheduling behavior changed.

All 29 exact-head runs passed: 62 successful jobs and four expected conditional
skips (staging evidence, inventory materialization, live parity, artifact release).
Vercel passed; no unresolved review threads. [Backend run 36833514719](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36833514719),
job `110275335236`, passed all 28 Edge roots and aggregate smoke, resolving the
local network block. Downloaded [smoke artifact 11147684656](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36833514719/artifacts/11147684656)
verified SHA256 `4132d666d04d2bb636ecedcd4e360e9c930df72651cdd8cddbabbad8ca384046`,
status 0, and all six REF-031 cases within 23 passing World tests.

[Critical Store/FX run 36833515104](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36833515104)
passed source/connected/browser/database jobs
`110275337561/110275337776/110275337787/110275337829`. These are required
cross-cutting regression results, not production certification. GitHub-reported
connected artifact `11148254630` digest is
`18d617fa17fa22dbbebb8dffede24072e71b291331830a45539a86f25f59748d`;
browser artifact `11148229368` digest is
`1da3b218c72d08a19f0f479c05f728dcaf204273e912a13f0b2aaf3c692b65c1`.
Those two ZIP hashes were not independently downloaded/reverified.

Merged-main automatic verification is terminal: 15 workflows, 14 successful and
one expected skipped Edge inventory workflow; 30 successful jobs and seven
expected conditional skips (two Edge convergence, dependency review, and four
live-parity/release jobs). No pending or failed jobs.

- [Backend Typecheck 36835597225](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36835597225): passed
- [Repository Quality 36835597365](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36835597365): passed
- [Store Cutover 36835597284](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36835597284): passed
- Store Atomic Settlement `36835597209`, Seller Offers `36835597327`, Listing Inventory `36835597329`, Withdrawal Safety `36835597276`: passed
- Runtime Wiring `36835597347`, Supply Chain `36835597312`, Beta Security `36835597328`, Beta Pilot `36835597273`, timezone `36835597308`, Manufacturing `36835597307`, Production Git Release contracts `36835597331`: passed
- Edge Inventory Convergence `36835597274`: expected skipped

REF-031 is VERIFIED_COMPLETE for this bounded read seam. Global query sites move
from the scoped repository (2→0) into the internal reference helper (0→2), without
adding queries or a new authority. The existing consumer contract and all scoped
queries remain unchanged. Only three existing docs close out this tranche.
REF-029 remains independently pending; other 49 task records are preserved.
Next dependent task: REF-032, subject to its own prerequisite/ownership preflight.
