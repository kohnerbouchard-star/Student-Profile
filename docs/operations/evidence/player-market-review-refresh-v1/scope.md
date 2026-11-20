# Preserve Market reviews during optional realtime refresh

## Ownership and current-main audit

- Scope ID: `PLAYER-MARKET-REVIEW-REFRESH-001`.
- Original audit/reproduction base: `ffd699e5a75cade488ddef0e8ba767cf2a5407b5` (merged PR #885). Publication base: `ea24905ef5770567c96cf128897335f69074fcd6`, preserving all merged Business #926 and Crafting #922 source, tests, complete intake and the 14-suffix registry. Runtime/test changes remain byte-identical to the independently reviewed original correction.
- Donor: PR #624, `83a9d2af37d2eab3202eee7293780dbd31443edb`, specifically its imperative Market-dialog pause guard. The user authorized repairing needed old PR changes against current main and merging only after verification. This is a bounded extraction, not wholesale replacement of the existing CSS owner.
- PR #624 remains preserved with its unique CSS/disclosure work unassessed. Its old ad hoc stale-read workaround is not imported: current main already has generation/lifecycle tickets and a shared freshness coordinator. Neither absent filenames nor historical CI establish that the residual UI work is obsolete.
- Active Business #926 ownership was checked with its owner: it does not edit this controller, index, main or shared CSS. Admin/teacher and other active work stay separate.
- Source-status reconciliation: PR #885 is merged as the base above; PR #925 and #928 are also in its ancestry. Their older draft/unmerged intake wording is historical source status. This correction does not grant broad runtime or production completion credit.

## Reproduced defect and narrow change

Market buy-quote and sell-review dialogs are appended to the DOM by `market-order-flow.js`; they do not set `terminalState.modal`. A focused confirmation button does not match the existing editable-field guard. On unchanged main, an optional Market invalidation starts a read and publishes store updates behind that dialog. The terminal's whole-mount render can remove the imperative review before the user confirms or cancels.

Add exactly one DOM-presence check for `[data-player-market-order-dialog]` to the existing `isUserInteracting` helper. Both refresh admission and post-read publication already consult that helper. Existing retry, pending invalidation, generation/session ownership, error handling and destroy behavior are preserved. Closing the dialog permits the pending read to retry normally.

This is only optional realtime refresh protection. It does not promise that arbitrary navigation, network/session transitions or all other terminal render sources preserve unconfirmed reviews. It adds no trade command, optimistic state, balance/inventory write, endpoint, RPC, migration, authentication change, CSS, dependency, workflow or deployment behavior.

## Files and verification

- Runtime: `player-terminal/src/realtime/player-invalidation-controller.js` (one added guard).
- Node regression: `player-terminal/tests/realtime-market-dialog.mjs`, registered by the existing `tests/realtime-freshness.mjs` entrypoint. It uses the real coordinator/store/controller and authenticated PlayerApi with a synthetic GET-only transport. Cases cover an already-open review, a review opened during a held read, pending invalidations, normal refresh after close and destroy cancelling retry.
- Browser regression: `player-terminal/tests/browser/market-review-realtime.spec.mjs`. Four scenarios exercise buy and sell review DOM/focus preservation for deferred and in-flight realtime reads; both configured desktop/mobile projects discover these cases. Uses the real terminal/Market flow/controller with synthetic reads and quotes, disallows settlement commands, and verifies refresh resumes after dismissal.
- Metadata: this record, an additive roadmap intake and eventual actual-numbered PR authority; regenerated architecture inventory is byte-identical to main. Inherit all 125 required / 92 critical checks and unchanged read-only verifiers from main PR885 authority. No predecessor gate may be removed.

Evidence at the uncommitted implementation checkpoint:

1. On unchanged main, the new Node regression fails at the intended assertion: an open review caused `['market']` instead of zero reads. A separate synthetic probe observed three store publications with `modal: null` while the review was open.
2. After the one-line guard, the full retained realtime suite and all three new cases pass. Full Player `npm run verify` passes, including newer generation, publication and session/lifecycle boundaries.
3. New browser file passes syntax validation. Local Chromium installation from the official pinned Playwright distribution fails because the returned ZIP is empty/truncated; no local browser execution or pass is claimed. Exact-head hosted desktop/mobile browser qualification is mandatory before merge.
4. Independent review found no actionable runtime or test-design finding and independently passed both Node test entrypoints. Architecture/seam ratchets, secret scanning and whitespace checks pass; inventory remains byte-identical (1,321 sources and unchanged debt/ceilings). Playwright discovers all eight new desktop/mobile cases. Backend TypeScript passes, but the all-Edge check stops at an unchanged Supabase SDK esm.sh import with connection refused. Full root `npm test` passes. Backend smoke also stops at the same unchanged connection-refused SDK import during the game-session suite; earlier suites passing do not certify the full gate. Exact-head CI remains pending. No partial run receives full-gate credit.

## Release and rollback boundary

No live data, manual dispatch, production deployment, release request, release branch, secret, credential or project setting change. The production hold remains. Roll back only this guard and its bounded tests/metadata through a normal reviewed change if required. Preserve the shared freshness coordinator, current main security controls and all #624 residual work. This scope is not `VERIFIED_COMPLETE` until its own merged source and required checks exist.

## Current-main continuation

The exact six-file correction is reconciled onto main `ea24905ef5770567c96cf128897335f69074fcd6`. All other files match that main, including Business and Crafting additions, their full roadmap entries and every registered migration suffix. Only the new seven-line Market intake is inserted into the current roadmap. The regenerated inventory remains byte-identical at 1,325 sources with the same debt ceilings. The main PR885 authority already contains every required/critical check in PR922 and PR926, so all 125/92 predecessor gates remain required. Earlier test results describe the original audit base; current-main regression and exact published-head qualification are required separately.

## Actual PR registration

Draft [PR #930](https://github.com/kohnerbouchard-star/Student-Profile/pull/930) publishes the independently reviewed six-file tree `5667ee99931c6fb523907b4ff5f9acdf572818d0` as implementation `10553e542c557a096e703340431db0fc6fe3b308`. Fresh integrated-base root and complete Player suites both pass. The additive `pr-930.json` registers exactly seven changed paths plus two read-only verifier locks, retaining the byte-identical 125 required / 92 critical check arrays from main PR885. No verifier/test file is changed and no predecessor authority is rewritten. This registration and its exact final head require independent review and fresh hosted checks; initial-head checks cannot qualify a later head. The existing seven-line intake is updated only with this draft identity and qualification state.
