# REF-044 — Contracts submission-detail presentation

Status: IN_PROGRESS. Bounded R2 repository seam; no deployment.
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
