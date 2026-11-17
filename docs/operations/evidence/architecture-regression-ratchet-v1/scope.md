# Architecture regression ratchets: bounded source-size and Player write policy

Status: `IMPLEMENTED_NOT_MERGED` (draft PR #985; exact-head qualification pending). Roadmap items: `ARCH-001-SIZE-WIRING-RATCHET-001`, `ARCH-001-PERSISTENCE-CENSUS-001` (separately owned, not implemented here). Base: actual main `8092e8fc12507bc77621ca851549fe7beb64fcd4`, after #981. This change does not alter application behavior, economic authority, routes, schemas, migrations, dependencies, permissions, deployment or production.

## Existing baseline and precise size scope

The existing inventory uses `source.split(/\r?\n/).length` and flags counts **greater than or equal to 500**, including its existing treatment of a trailing newline. The count at base is zero in the five existing inventoried JavaScript/TypeScript roots, although the old maximum remains 100. The existing architecture ratchet's oversized-source maximum is lowered to zero and oversized-handler maximum to zero. Its existing scanner, roots and assertion coverage remain unchanged.

The supplementary size guard independently includes those five roots plus executable JavaScript/TypeScript in `api/`, `auth/` and `player-terminal/host-runtime.js`; it also covers `.jsx`, `.mts` and `.cts`. It includes colocated tests under these roots, fails on source symlinks rather than following them, and excludes generated `node_modules`, `dist` and `coverage` paths. At base this extended set has 1,649 files and zero at or above 500. This is **not** a repository-wide size claim: CSS, HTML, SQL/migrations, documentation, assets, `scripts/` and Player tooling are not in scope. Existing large test/automation scripts and CSS are not silently counted as runtime source or deleted.

The new policy has zero size exceptions. If an exception is genuinely necessary, it must be a separate, explicitly reviewed change recording the exact path, line maximum, owner, reason, repository review evidence and removal condition. The guard rejects globs, duplicate paths, missing metadata/evidence, additions beyond an exception's recorded maximum, and renames to unlisted paths. A reduction below the threshold or removal requires deleting the now-stale exception. A reduction still above the threshold is allowed when the exact-path maximum is lowered in the same change; this prevents later regrowth into old headroom. Metadata is an audit record, not a substitute for actual owner approval or code review.

## Player write-policy coverage and known exceptions

Every registered Player write endpoint must have an idempotency decision and an explicit resource invalidation policy, even if the latter is an empty list. The new guard checks endpoint registration, per-write policies, resource names, duplicates and orphan policy entries. It does not prove the correctness of server-side transactions, retry semantics, UI reachability or the contents of a refresh list; retain all connected and semantic tests.

At the base, `businessFormationPropose`, `businessFormationRespond` and `businessFormationActivate` lack both automatic idempotency and invalidation registration. These three exact entries are recorded as known debt, **not** an approval to ship an unsafe or complete formation journey. A local fake-transport reproduction of the real Player client/adapter rejected normal calls before network dispatch due to missing idempotency keys. Fixing formation must add retry-safe keys, appropriate resource refresh, end-to-end coverage and remove each corresponding exception; this ratchet does not make that product fix.

`storeQuote` and `storeOfferQuote` already have idempotency registration but currently rely on an implicit empty invalidation default. Their exact missing explicit invalidation entries are recorded separately. Quote operations can persist quote records; their precise effects and appropriate refresh policy require review before declaring an explicit policy and removing each exception.

New exceptions require explicit owner/code review and must specify an exact endpoint, HTTP method, path and missing kinds, owner, rationale, repository review evidence and removal condition. The guard cannot authenticate a human approval; the review process must. It rejects new missing policies without an exact entry, unregistered/renamed endpoints, changed methods or paths, expanded missing kinds and stale exception entries. Improvements are allowed when the matching exception is narrowed or removed in the same change.

## Other retained architecture controls

The existing measured deep-import ceiling is lowered from 168 to the current 71 lexical declarations, cross-domain infrastructure imports from 9 to 0, and production transport monkey-patch file ceiling from 9 to 8. These are count-based candidate ceilings, not proof each observation is a violation or that an equal-count swap is impossible. The existing per-site REF-005 seam ratchet and interaction-wiring audit remain active and unchanged. The persistence ceiling remains unchanged: its current generic TypeScript call blind spot is owned by the separate local census correction and must not be misrepresented as a clean current count or merged into this narrow request without separate review.

## Verification and next gate

Pinned Node 22.23.1/npm 10.9.8 local results on the candidate working tree: `npm run audit:architecture` passed 54/54 registered focused/adversarial and retained seam tests; full `npm test` passed with 461 summarized Node test passes and one intentionally opt-in disposable PostgreSQL proof skipped, plus its other script checks; architecture inventory regenerated without a diff; tracked-source and explicitly included new-file secret scans passed; `git diff --check` passed. The npm dependencies were reused, not installed fresh. A supplemental backend TypeScript run was killed by the environment; no backend typecheck success is claimed and no backend runtime source changed.

Independent source review initially found missing aggregate registration of the retained seam integration suite and unpinned write-exception method/path identities. Both were corrected and tested; independent re-review passed `npm run audit:architecture` 54/54 and found no further blocker in its reviewed scope. No hosted CI, browser, staging, production, data mutation or deployment is claimed. Reconcile actual main and any parallel #984 changes; publish only under coordinator direction; qualify exact-head required checks before any merge. The broader persistence-census candidate remains separately owned and needs current-main reconciliation after this narrow ratchet is settled.


## Actual-main integration checkpoint

The initial ratchet implementation `685fb91d402787bfb6846ca8ea1c1f8e30f8a307` is normally merged locally with actual main `39685d2c29394caa425d928649804a433806e521`, which includes merged security #984. Only the shared Scope Intake conflicted; preserve both complete entries and all pre-existing roadmap text. Preserve every security source, test, authority and evidence file byte-for-byte from that main. The earlier #984 `IMPLEMENTED_NOT_MERGED` wording is historical as to source integration; actual-main push qualification remains pending, not inferred from merge.

At that checkpoint this was local preparation. Fresh committed-union tests, independent union and required-CI scope review, exact-head hosted qualification and coordinator-controlled publication were mandatory. #984 actual-main postmerge clearance was subsequently reported by the coordinator. No production change or gate waiver is claimed.


## Draft publication checkpoint

Draft [PR #985](https://github.com/kohnerbouchard-star/Student-Profile/pull/985) published source tree `cc898ea2c0d09370c1a40e75a3699d8692b4981b` on main `39685d2c29394caa425d928649804a433806e521`. Its PR-bound verification contract locks the exact changed paths and read-only verifier files. The planned PR matrix, derived from the main workflow definitions, has 39 workflow families and 61 normally active job definitions; nine additional jobs are explicitly guarded from ordinary PR execution. This is a static expectation, not a claim of hosted results or coverage of external checks. Qualification must use the actual final head and current main. Initial source-only CI could not satisfy PR-bound authority before this contract existed.

The coordinator reports that the owner elected to retain the existing automatic production sync. This change makes no runtime, migration, dependency, deployment-setting or production change itself; nevertheless a future main merge may trigger the existing synchronization and requires serial coordination, exact-head CI and verification of actual post-merge effects.
