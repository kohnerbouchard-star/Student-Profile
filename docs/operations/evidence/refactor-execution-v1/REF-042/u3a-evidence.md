# REF-042a / U3a — injectable resource freshness

Status: IMPLEMENTED_NOT_MERGED; REF-042 stays BLOCKED. Base:
`1a0ff1adb28f710d646c655c8ca91b24e799dd18`. Parent accepted [PR824 registration](https://github.com/kohnerbouchard-star/Student-Profile/pull/824)
and authorized this child before its merge; PR824 is not represented as merged.
PR823/824 heads and main remain untouched. No deployment/production qualification.

Scope: `player-terminal/src/api/resource-freshness-coordinator.js`,
`player-terminal/src/api/player-api.js`, `player-terminal/tests/read-invalidation-ordering.mjs`;
this evidence and one allocated exact-PR authority. Generated architecture inventory
is separately declared (sourceFiles 1270→1271; all boundary measures unchanged).
No app/action/realtime composition, resource-list, CSS, main.js, backend, package,
workflow, U1, REF044, global ledger or CampusPay changes. Existing #624 handoff
remains only the accepted freshness workaround; no donor source was imported.

Before edits, both existing characterize.mjs commands passed on unchanged base
(Node 22.23.1), reporting defects: warm use/redemption shows Inventory 0 versus
server 1; targeted candidate uses one POST/three GETs (use), one POST/two GETs
(redemption), but held realtime completion regresses 1→0. These are diagnostics,
not passing acceptance assertions. Uninjected composition remains unfixed here.

`createResourceFreshnessCoordinator()` owns terminal-local epoch/resource tickets,
pending generations and in-flight equivalence. `new PlayerApi(config, { freshness })`
is optional; existing callers retain standalone behavior. Equivalent concurrent
reads require identical config identity and request parameters, current tickets,
and no caller-owned abort signal. Different terminal coordinators never coalesce.
Shared generation tickets fence sibling caches, errors/401 and final batch/route/
bootstrap results; session transitions also fence writes before invalidation.
WRITE_INVALIDATIONS remains the sole list owner. Applied/replayed receipts advance
generations before follow-up GET; rejected writes leave them unchanged.

Child b must inject the same coordinator only into one terminal's participants,
bridge realtime invalidations and check `freshness.isCurrent(freshness.ticketFor(result))`
at final store publication, even after an API promise has already fulfilled.
Bootstrap and batch/route objects retain their public shape via WeakMap tickets.
Mixed stale batches reject as a whole; they never publish stale values/status/errors.
Child b must suppress superseded/aborted UI effects and fence timers/toasts/401,
logout/destroy/remount. Reset retires tickets; it does not implement host cleanup.

Qualification: extended existing read-ordering script passes shared/coalesced and
isolated reads, cache/query boundaries, applied/replayed/rejected writes, held old
reads, mixed batches/late 401, failed-refresh tickets, delayed dependent routes,
bootstrap capability fencing, session retirement and independent abort ownership.
Full Player verify and root npm test pass; architecture/high-priority/legacy and
interaction guards are included. Pinned tools: Node 22.23.1/npm 10.9.8/Deno 2.9.3.
Local backend typecheck reaches Edge resolution then fails downloading pinned
esm.sh dependency; it is BLOCKED, not passed. Pinned Player browser cases cannot
launch missing Chromium1217; installation fails HTTP403 Domain forbidden. Exact-head
CI must supply these gates. Supplemental system-browser results are separate.

Debt boundary: zero terminal participants inject the coordinator yet; original
full-refresh calls remain. No whole-REF042 fix, browser interaction qualification
or live economic behavior is certified. Parent owns source review/merge and fresh
merged-main verification. Rollback reverts this child without undoing later fixes.
Next: accepted child b after this child merges; neither child alone closes REF042.

Supplemental system Chromium route-refresh diagnostic: three passed/three existing
conditional skips (16 seconds); video disabled only in the temporary diagnostic
config. No pinned-browser credit. Backend smoke also stops at pinned dependency
resolution. Secret scan and whitespace checks pass; no baseline assertion weakened.

Draft [PR825](https://github.com/kohnerbouchard-star/Student-Profile/pull/825), source
`9fc51d79b6c4dff4a8f923f99ffec2fd4d4c5bc2`; PR-bound authority added separately.
Six changed paths including generated inventory. No existing assertions removed.
