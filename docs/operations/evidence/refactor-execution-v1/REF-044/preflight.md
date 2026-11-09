# REF-044 — Contracts submission-detail presentation

Status: VERIFIED_COMPLETE (bounded repository seam only). Bounded R2 repository seam; no deployment.
Base: `87c576a3b0d7a7d0365ae6641cd3e53f812b06f6` after reviewed REF043 closeout.
REF007/008/009/043 are VERIFIED_COMPLETE and their source merges are ancestors.
No active Contracts/REF044 owner exists. Protected PR624/668/690/730/731/735/736
heads/changed paths were rechecked without collision. U1 release-hold paths,
workflows/tests and REF032 evidence remain separately owned and untouched.

## Scope and preserved behavior

Approved source/test paths: ContractsRoute.js, new ContractSubmissionDetail.js
under admin/v2/src/routes/contracts, and scripts/admin-v2-contracts-browser-smoke.mjs.
Only the participant/submission table, empty state, identity and per-row actions
move to the presentation module. Existing route formatters/button renderers are
explicit inputs so their behavior is neither duplicated nor redesigned.
The summary, loading/error state, drawer/dialog lifecycle, focus, detail-sequence
fence, controller, API, capabilities, mutation/retry and authoritative refresh
remain in their existing owners. No new network, permission or selected-game owner.

Additional exact paths: this record; tasks/REF-044.md and only REF044 in backlog.json
under docs/roadmaps/refactor-execution-v1; generated architecture inventory; an
exact-PR player-cross-cutting authority if required. No package/workflow/CSS/API/
backend/auth/shared primitive, migration, cloud setting, credential or CampusPay edit.
Stay within eight meaningful files and 400 changed semantic lines; inventory is
listed separately. Stop for baseline defects, owner collision or scope expansion.

Preserve DOM/classes, table caption/row keys/sorting, escaped text and UUID safety,
empty/many rows, canReview-before-canIssueReward ordering, action labels/tones,
currentTarget opener identity and exact review/reward callbacks. The component
receives already-normalized data; it does not derive authorization or mutate it.
Rollback is a normal revert of this view/caller/test extraction, retaining U2.

## Characterization and qualification

Before any renderer edit, Contracts API/controller tests pass 6/6. Original
browser smoke passes 7 checks and two desktop/mobile screenshots using system
Chromium 151.0.7922.173 as a supplemental local diagnostic, with Playwright 1.62.0.
Pinned Chromium revision1234 (151.0.7922.34) CI remains the acceptance gate;
no system-browser result is relabeled as pinned qualification.

Extend the existing browser suite before extraction for empty/16-row submission
states, escaped markup/long multilingual evidence, action eligibility, keyboard/
focus, failed review/form retention, duplicate click and exact domain-read counts.
Record before/after DOM hashes and screenshots; preserve all original assertions.
Run existing Contracts API and lifecycle browser suites, Admin V2/browser, local
mutation UI, affected backend review/reward and shared root/architecture/security
checks. Record environment-blocked commands honestly and require exact-head CI.
No completion credit until parent-reviewed merge and merged-main qualification.

## Candidate evidence and main reconciliation

Reconciled main `378f99849f63d044ab75029e751188a88b4ac122` by normal merge;
all five U1 hold paths are byte-identical. Source extraction is ed6762464fd11566592033e30a796c0d282b4f45.
Twelve browser checks pass against untouched 87c576a3 assets and the candidate,
including two-game controller remount/late-detail disposal with zero mutations.
All four detail DOM hashes match: empty 5753060a6a74ef8fe4f98efe0f6d3d9e32562db25b4c1225d9acd541551d5ede;
mixed cafad55fdbf44828d784b37ed7f1b3c1ea1a91995611366faa1e3f9c59c4a902 (both viewports).
Four screenshots are byte-identical; two desktop differences are confined to a
7x9-pixel background region outside the drawer. No extracted-view pixel change.
Supplemental lifecycle and full Admin browser pass (25 passes/eight retained exceptions).
Local Contracts 6/6, Admin 91/91, mutation UI 54/54, authority 16/16, root,
architecture/high-priority/legacy/interaction/secrets and diff checks pass.
Inventory sourceFiles 1269 to 1270; all boundary counts unchanged. One 43-line
presentation owner has one route caller; controller and API remain unchanged.
Local Edge/full smoke/review-reward tests are blocked by pinned esm.sh tunnel
refusal; they and pinned-browser acceptance require fresh exact-head CI.

## Qualified merged-source closeout — 2026-10-02

Parent independently approved the presentation-only extraction: [PR820](https://github.com/kohnerbouchard-star/Student-Profile/pull/820),
head `e8a4a1a73089a778fe98633f45aa9c77abebb75c`, merge
`059cd3cef1998e7a95ba359c2271b48602b794a9`. Eight changed paths / 379 lines
include evidence and generated inventory. ContractsRoute delegates presentation
to ContractSubmissionDetail; controller/API, routes/RPCs, permissions, economic
writes and CSS are unchanged. No migration or runtime deployment is part of REF044.

Independent recovery audit fetched `1a0ff1adb28f710d646c655c8ca91b24e799dd18`.
The source merge is an ancestor; later PR822 changes only five separately owned
U1 paths. No earlier workspace patch or unpublished closeout was assumed present.
Open PRs #624/668/690/730/731/735/736 remain separate; no REF044 closeout draft
or remote closeout branch existed at inspection. Editable closeout paths are
this record, tasks/REF-044.md and only REF044's backlog object. All nine literal
false hosted-job guards and the removed automatic production trigger are retained.

Exact-head evidence, re-read through GitHub API and downloaded artifact contents:

- [Contracts run 36954504416](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36954504416)
  passed; [artifact 11205596493](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36954504416/artifacts/11205596493),
  ZIP SHA-256 `a374a4de05aba143c8acb36d664e2b552cb9be878617b6c8247f20154dece906`.
  All 12 responsive/lifecycle checks pass; four detail DOM hashes match the
  recorded untouched baseline above. Six screenshots are retained in the artifact.
- [Admin run 36954504230](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36954504230)
  passed; [artifact 11205866483](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36954504230/artifacts/11205866483),
  ZIP SHA-256 `107dbc31540b6fd1f24d575e4249c9fb15c02d4dc0dc8ed3a03480bb20810a26`.
  Candidate: 25 passes, eight existing UUID exceptions, zero failures. Connected
  mutation balance 0→18 persists at 18 after reload/replay; unauthenticated access
  is rejected. Retained baseline report fails Market horizontal truncation before
  any case completes (zero checks); it is historical failure evidence, not a pass.
- Backend/typecheck/smoke [36954504157](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36954504157)
  and review/reward database qualification [36954504271](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36954504271)
  pass, resolving the prior local dependency-download limitation for acceptance.
- Promotion-contract [36954504451](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36954504451)
  initially cancelled before jobs under shared concurrency; user-triggered attempt
  2 succeeds on the same head. No deployment dispatch recovered this static check.
  Historical terminal snapshot: 75 checks, 69 success/six conditional skips.
  Fresh recovery snapshot: 76 checks, 70 success/six skips (later Branch Hygiene),
  no failure/pending; Vercel status success. All 34 listed PR workflows now succeed.
- Merged-source `059cd3cef`: 18 successful push workflows. The earlier snapshot
  recorded 37 successful checks/10 conditional skips; fresh recovery sees 37
  success/18 skips, plus six skipped Vercel Git Production Verification workflows.
  No failed/pending check. Skipped hosted verification does not certify production.
  Parent's merged-source local qualification: Contracts 6/6, Admin 91/91 and
  architecture pass. Recovery reruns and docs checks are recorded below.

The original local dependency failures, system-browser qualification limit and
UUID exceptions remain historical evidence. Browser fixtures and connected CI
qualification are not live production certification. Debt remains one route
caller into the 43-line presentation owner; source-file denominator 1269→1270,
with unchanged architecture boundary counts. No scoped blocker remains.
Closeout publication/merge remains parent-owned. Only REF044 changes status;
all 50 primary IDs/dependencies and other statuses are preserved (34→35 complete
when this ledger change merges). Next exact action: U3/REF042 child registration
for review, without source implementation or parent-task completion credit.

Recovery checks on `1a0ff1adb28f710d646c655c8ca91b24e799dd18` with this docs
patch: Node 22.23.1, Contracts `node --test scripts/admin-v2-contracts-api.test.mjs`
6/6; `npm run test:admin-v2` 91/91; `npm run audit:architecture` (generated
inventory unchanged), `npm run security:secrets`, 50 unique IDs/task paths,
acyclic unchanged dependencies, unchanged other queue objects, relative links,
three-path scope and `git diff --check` pass. No new browser/backend/runtime
execution is claimed for this docs-only patch; exact implementation artifacts
and merged-source evidence above supply those prior acceptance results.
