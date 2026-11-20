# REF-032 World runtime read boundary verification

Status: VERIFIED_COMPLETE — scoped merged-source qualification; parent closeout proposal. Historical base main `eabf3d032768771ebdee652a9d6d1ce35d655734`.
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

Integration after REF-029 closeout: main `c799110e2d89d76c7d013ae49adce50c22b6c81e`
is merged normally, preserving REF-029/031 code, evidence and backlog records.
Inventory is regenerated for both contributions (1261 source/test files).
Pre-integration head `557608301b15d2d48afa42c80662aa5575a808e2` passed all
33 runs, 66 jobs and Vercel with 13 expected conditional skips. Its downloaded
smoke artifact `11151220893` verified digest
`453488d3ee703a08278bad95c77bcc17548989ef06caf0cbf2df423e1d8d9f12`,
status 0 and all 13 REF-032 cases. Fresh combined-head CI remains mandatory.

## Qualified source and guarded merge

[PR790](https://github.com/kohnerbouchard-star/Student-Profile/pull/790) qualified
combined head `962d5db36ee4fe4e12b34bdce1881855c7f8e307` and merged with an
expected-head-guarded merge as `0a3d88ceff3bb1db0b4ffcd306a21b872159cf9e`.
Both trees equal `4dad9d7f57d1f35f7f0faecd6de1c42c701e8b7f`.
Independent review accepted the verification-only disposition and bounded tests.
The final source diff is seven paths, six meaningful plus generated inventory,
315 additions and five deletions; executable application behavior is unchanged.

All 33 exact-head workflows passed: 66 successful jobs and 13 expected
conditional staging/live/release/materialization skips. Vercel passed and no
unresolved review threads remained. [Backend run 36842994048](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36842994048),
job `110306252034`, passed full backend typecheck and aggregate smoke, resolving
the local dependency-fetch block. Downloaded [smoke artifact 11152566109](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36842994048/artifacts/11152566109)
verified SHA256 `5fcfba418b506060d0793d57ad5752c20ac87386ca567ed14bee2c988186b1c8`,
status 0, all 13 REF-032 cases, World 50 and retained Contracts 95.
[World Runtime run 36842994059](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36842994059),
job `110306251146`, also passed.

[Critical Store/FX run 36842994139](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36842994139)
passed source, connected, Player browser and database jobs
`110306251992/110306252154/110306252227/110306252238`. These are required
cross-cutting regression results, not production certification. The new World
cases use synthetic query clients through the actual application/repository;
they do not represent hosted runtime or authenticated production evidence.


## Post-merge blocker and preserved release boundary

Main verification cannot be called complete. [Database Replay 36844808428](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36844808428)
passed clean replay/lint (job `110312276480`) but failed production-shaped and
staging-shaped rehearsals (`110313315104/110313315169`):
`Expected 151 forward migrations, found 152.`
[Staging Convergence 36844808478](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36844808478)
passed its static contract but failed prerequisite job `110312644454` waiting
for that replay. The populated-staging mutation, Edge deployment and browser
jobs were skipped; no deployment or convergence success is claimed. Existing
automatic rehearsal jobs captured schemas and used disposable local databases;
this record does not authorize new hosted requests or mutations.

The existing bundle builder fixes `PHASE15_END=20260920082200` and 151 common
migrations. The rehearsal shell selects every version at/after the cutoff,
without that upper bound. The extra file is
`20260921044500_reconcile_internal_runner_nonce_service_role_authority_v1.sql`,
introduced by [PR733](https://github.com/kohnerbouchard-star/Student-Profile/pull/733),
commit `a303d9f067f8f37dbd2a57391cc8b31e7a4021e1`. Its historical
[Database Replay 35562340472](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35562340472)
failed both rehearsals; job `106217916164` records the identical count error.
The preceding [run 35550498261](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/35550498261)
at `5b11f344bc0e725cf7028c3f7c4a2a890e9972e3` passed clean replay and both
rehearsal jobs `106184578513/106184578563`.

Compared with pre-REF-032 main `c799110e2d89d76c7d013ae49adce50c22b6c81e`,
migration tree `e93120898574e725be58870e603a5244f4079777` and release-script
tree `f10708ec34541b86c06825cd80842490d65f4487` are unchanged. This attributes
an inherited selector/bundle inconsistency; it does not prove convergence is
safe or that excluding the extra migration would certify the current runtime.
Do not raise the expected count or silently exclude a migration to turn CI green.

REF-032 remains BLOCKED despite its accepted, merged verification-only source.
Smallest next action: the release owner reconciles rehearsal selection with the
immutable bundle and the later nonce migration, then supplies required fresh
main evidence under the separate release gates. No release-file or SQL edit is
included here. The three existing docs preserve the other 49 task records and
all incident gates. REF-033 still depends on REF-032 and pending REF-030;
independent REF-030 qualification can continue under its existing owner.

## Scoped source closeout — 2026-10-04

Audited main: `9ff69a1c28ebc52c639f8bf347f4ace2f5f05b04`. This section supersedes
the historical REF-032 blocker above, preserving its failed runs and attribution.
Exactly three documentation/data paths change: this evidence, task REF-032 and
only its backlog entry. All other 49 task records, IDs, dependency edges, source,
workflows, migrations, inventory counts and release constraints are unchanged.
Parent owns independent acceptance review and merge; this draft is not deployed
runtime or global beta/ARCH certification. REF-031 remains the completed dependency.

### Original acceptance and fresh merged-main checks

World domain source/tests remain byte-identical to qualified PR790 head
`962d5db36ee4fe4e12b34bdce1881855c7f8e307`, merged as
`0a3d88ceff3bb1db0b4ffcd306a21b872159cf9e`. The application owner is still
`createPlayerWorldRuntimeService.readContext`; one repository read and pure
projection preserve 7–10-query fan-out, game/Player predicates, optional-null and
error behavior, ordering, privacy and revision freshness. No read calls the clock,
ID generators, writes or RPCs. Travel/arrival/residency commands stay separate.
Existing callers and debt measures are unchanged; no wrapper or debt deletion is
claimed. The original inventory denominator was 1261 source/test files at PR790;
this documentation closeout adds none and changes no inventory or ceiling.

Fresh commands at audited main, pinned Node 22.23.1 / npm 10.9.8 / Deno 2.9.3:
- Backend `test:world-runtime`: 50 + 11 PASS, including all 13 REF032 read cases.
  Cases cover two games/shared definitions, scope denial before reads, paused-game
  denial, paused campaign, 7/10-query branches, every dependency failure, private
  projection, optional journey/history ordering and fresh revision reads.
- `test:player-world`: 23 PASS; `test:player-security`: 59 PASS;
  `test:player-capabilities`: 11 PASS.
- Player `world-runtime`, `world-news-route` and full `verify`: PASS.
- Root `npm test`, including architecture/high-priority/legacy audits: PASS;
  secret scan and whitespace: PASS; no generated inventory diff.

Exact-main Beta Security run `37174328364`, job `111353680100`, passes its
fail-closed full `typecheck:all` plus additional security-root checks. Downloaded
artifact `11292308601` contains actual tsc, all 28 Edge roots and seven additional
checks without error lines; ZIP SHA256
`27608d07ce58c3614068d3371c3036c4c68b8fd4b6215c9011f4c5fa893346e0`
matches GitHub. This supplies actual fresh-main typecheck despite local esm.sh
proxy failures. Main Repository Quality `37174328388` also passed.

Aggregate backend smoke is supporting qualified-source evidence, not fresh-main
execution: #838 run `37172002052`, job `111346683703`, at
`8dd2974a0b5017d7a36d228d8191b84113085696`. Backend, api, admin, auth, frontend/src,
backend workflow and package/lock files are byte-identical to audited main.
Downloaded smoke artifact `11292105766` has stored status 0, all 27 Deno suite
summaries totaling 1357 PASS / 0 FAIL, all 13 REF032 cases and all command roots
through admin-local-mutations; no error lines. ZIP SHA256
`bcc9e6af95d883238737fd5040561f065981b9a1bbedc09fafd5345bd9e11edf`
matches GitHub. Local aggregate smoke remains dependency-fetch BLOCKED / exit 1;
it is not relabeled passed. Execution-contract section 5 requires exact source
attribution and forbids calling another SHA exact-head; it contains no blanket
inheritance exception. VALIDATION distinguishes source-refactor checks from
this documentation-only closeout. The parent accepts this explicitly attributed
combination without inventing another runtime/capture or optional rerun gate.

### U1 prerequisite resolved without release restoration

The immutable bundle remains 151 staging / 169 production (18 prelude + 151 common),
with the later nonce migration explicitly accounted outside the bundle. Existing
plan/digest/negative tests preserve identities and fail closed on unapproved suffix
changes. Rehearsal scripts, builder, plan and migrations are unchanged between
production capture source below and audited main. Source-only qualification
retains 28 reconciliation passes, the existing unexecuted local PostgreSQL test,
15 release-integrity passes and all nine positive/negative hold contracts.

| Evidence | Staging | Production (historical, no recapture) |
| --- | --- | --- |
| Run / job | 37173999995 / 111352700110 | 36961759600 / 110696781402 |
| Source | 0384fe285a12b2e429e1cb28ac46dfea9519a346 | 1a0ff1adb28f710d646c655c8ca91b24e799dd18 |
| Sanitized artifact | 11292413019 | 11208776447 |
| Status / exit | PASS / 0 | PASS / 0 |
| Certified / applied migrations | 151 / 0 | 169 / 0 |
| Canonical application schema matched | true | true |
| Capture, disposable rehearsal, raw cleanup | success | success |
| releaseCertificate | false | false |

Downloaded archives contain only `result.json`; SHA256 values match GitHub:
staging `979446b346c7152f25e7a3cce887d2258c8a173a202aadfcb53b973fb27f9df4`,
production `cc1eb97272788eb2a333de7b5dd068c4ff3f0a5e3d90db43df4ca188ee572c34`.
Staging followed reviewed #839 merge and successful exact-main push replay
`37173648612` at `0384fe28`, attempt 1; main stayed frozen through confirmed cleanup.
The original staging failure before capture (missing SUPABASE_DB_URL) and its
skipped rehearsal remain historical failure, not a passing result. No blind retry
or production recapture occurred. Replay's 17 error-level lint findings are exactly
the prior main baseline; a successful workflow is not a zero-error lint claim.

These prove schema-shaped disposable rehearsal, not populated data compatibility,
authenticated hosted reads, deployed behavior, live convergence or a release.
Those separate release/runtime gates remain, as do #730/#731 ownership, all nine
U1 holds and `releaseCertificate:false`. No further capture, live SQL, deployment,
credential/security change or hold restoration is authorized by this closeout.

The original source acceptance is met with the provenance and limitations above.
Only REF-032's scoped ledger disposition is proposed as VERIFIED_COMPLETE. Parent
review/merge and applicable docs CI are required; this proposal itself does not
start REF-033/034/046. Next: parent closes REF-032, then assigns REF-033 after
confirming REF-030 and the other original gates. Rollback reverts this three-path
closeout only, preserving source qualification, historical evidence and holds.
