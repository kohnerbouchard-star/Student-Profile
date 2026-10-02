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
