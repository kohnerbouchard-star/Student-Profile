# REF-043 — Banking response extraction qualification

Status: VERIFIED_COMPLETE (bounded repository seam only). Historical blockers
below are retained; final qualification is recorded in the closeout section.

## Bounded source and parity evidence

Base application: `eed2b365f2314f7b788bd658b419cf05bc42200a`.
Draft implementation [PR #810](https://github.com/kohnerbouchard-star/Student-Profile/pull/810)
remains unmerged at `17f5499b1b296fab69f7841df86cc1d48ecbf85b`, tree
`6a5f72654ec554ebdbdab3ea7e3ff711be39e6ab`. No source from that PR is
accepted by this documentation-only disposition. Dependency REF-005 is complete.

The draft extracts duplicated playerRows/historyRows envelope traversal from
BankingController into one 14-line BankingResponse reader with two callers.
Candidate order, players-before-roster within each record, first valid array
including empty, bare-array players only, INVALID_RESPONSE, 2,000/250 limits,
Checking/Savings, currencies, numbers, UUID redaction and freezing are preserved.
No API, transport, auth, BFF, backend, renderer, mutation or retry change.
Protected #624 Player Banking/CSS and #668 Staff context do not own these paths.

Fourteen Banking tests pass on unchanged source and after extraction; the
existing Admin suite imports them. Candidate Admin tests 91/91, public Banking
38/38 and Admin economic writes 2/2 pass. Architecture, high-priority boundaries,
legacy runtime, interaction wiring, secrets, root npm test, backend TypeScript,
authority tests and diff checks pass locally. Local Edge/full smoke imports and
pinned browser downloads were blocked by the execution environment, not counted
as passes. Diagnostic-head CI finishes with 31 successful workflows and one
failed Admin Browser E2E workflow. This is not overall acceptance.

## Exact baseline blocker

The previously unregistered `npm run test:admin-v2:browser` was wired to an
existing exact-head CI workflow in the draft. Pinned Chromium installed there.
Initial run 36882836455 failed Overview navigation before any Banking journey.
A bounded diagnostic then ran the unchanged harness against detached exact-base
assets, followed by the candidate with its failure still enforced.

[Run 36885470152](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36885470152),
job `110447558791`, proves both fail with the same assertion:
`ready 1440x900 route market truncates horizontally` at
`scripts/admin-v2-browser-smoke.mjs:255` (caller line 898).
The log confirms base checkout `eed2b365`, baseline exit 1, and candidate exit 1.
Navigation registry, renderer, CSS and browser harness are unchanged by the draft.

[Sanitized artifact 11174828911](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36885470152/artifacts/11174828911)
was downloaded and inspected: baseline and candidate JSON both have status
`failed`, the identical assertion, and zero completed cases. Zero summary counts
are not success: the first viewport failed before a completed case was recorded.
Separate staticRoot fields identify the detached baseline and candidate assets.

## Stop, ownership and next action

REF-043 cannot be VERIFIED_COMPLETE or merged while the required baseline is
red. Keep #810 draft, including its evidence; do not import its runtime or CI
changes through this record. No CSS/navigation fix or assertion weakening is
within the approved Banking extraction. The exact failing layout/test contract
needs a separately bounded owner and guidance before correction. After that
baseline passes, rebase the draft, rerun all exact-head gates and review parity.
REF-044 remains gated by REF-043; REF-045 is next independently eligible
preflight, subject to fresh ownership/dependency audit.

This disposition changes only this record, REF-043 task status, and REF-043 in
the backlog. Global beta/release ownership and all other task states are retained.

## U2 merged baseline and PR810 reconciliation — 2026-10-02

The preceding disposition is historical. Parent reviewed U2 head
`15b9e355e81e68085cee879c4666e01c699c8f98` and merged PR817 as
`6a85259838f86e6137e7fc81b4f2c80e6475f940`, the fetched reconciliation base.
Run 36948739458 passed 25 Admin V2 checks, retained eight existing UUID-debt
exceptions, and passed connected Create Game/Admin and secure ledger replay.
Artifact 11203272313 was downloaded and its SHA256 verified as
`6940a7b0d21a7a50ac8d363e3554bcfcaf7a3de205f431e13f19e4579818e958`.
All 19 PR817 workflows passed; Admin Shell required one unchanged-job retry
after a recorded modal-focus timeout. These are U2 results, not PR810 acceptance.

Parent authorized reconciling existing draft PR810 in place, preserving its
original reader/caller/test intent and U2 qualification. Original owner head
`17f5499b1b296fab69f7841df86cc1d48ecbf85b` is retained as a merge parent.
Main has no intervening Banking source/test changes. Its unchanged controller
passes the original 14 characterization tests; its Admin suite passes 86/86.

Exactly five merge conflicts were predicted and resolved: retain current main
browser workflow and BLOCKED backlog; retain main task/evidence history and
append this resumption; regenerate the architecture inventory. Workflow bytes
remain identical to merged U2, including the fixed untouched 56957a92 baseline,
required original Market-failure assertion, enforced candidate suite, artifact
sanitization and connected gates. No obsolete PR810 workflow is restored.

Editable paths remain the original nine-path PR810 scope: BankingController,
BankingResponse, existing Banking test, generated architecture inventory,
pr-810 authority JSON, this preflight, REF-043 task, backlog and Admin Browser
E2E workflow. Backlog and workflow resolve identically to main. No authority
allowlist expansion or verifier change. Protected PR624/668/690/730/731/735/736
heads were rechecked and remain unchanged; no runtime path overlaps this seam.

The original Banking controller, 14-line reader and characterization test are
byte-identical to original PR810. Two duplicated traversals become one with two
callers. Current inventory sourceFiles rises 1268 to 1269; all boundary counts
remain unchanged. No API, transport, mutation, renderer, layout, migration,
release, settings, credential or CampusPay change. Rollback is a normal bounded
source revert preserving U2 and subsequent accepted work.

Fresh candidate local checks: Banking 14/14, Admin 91/91, public Banking 38/38
and economic writes 2/2 pass. Full Edge typecheck and backend smoke remain
environment-blocked by pinned esm.sh imports; browser remains blocked by the
missing pinned Chromium download. These require exact-head CI, not a waiver.
Root npm test, architecture/high-priority/legacy/interaction/secrets checks,
authority 16/16 and the exact seven-path authority check pass after inventory
commit. Diff checks pass; generated browser-failure evidence is kept outside
the source tree. Merged-main Backend and Admin Shell push checks pass in runs
36949533156 and 36949533195; code scanning was still running at this snapshot.
No dedicated Banking browser or production-runtime acceptance is inferred.

REF-043 remains BLOCKED until fresh PR810 qualification, parent-reviewed merge
and merged-main verification. REF-044 remains gated. Final exact-head CI and
artifact identities belong in the existing PR810 qualification record; no
replacement PR, U1 release-hold action or production deployment is authorized.

## Qualified merged-source closeout — 2026-10-02

Parent independently reviewed and merged existing PR810 at implementation head
`779677a3287fa6b912813f2a335b5e28a97c6d1e` as
`4620fb60dc2d13b5063a9917b2ec9e13e5a26f7f`. Both resolve to the exact tree
`ba6194ffcfd73a54970b93fdd617e4c9f3634a60`; the merged tree has no additional
source changes. Original head 17f5499 remains in history. U2 baseline repair
PR817 remains separately credited, not folded into the Banking extraction.

All 33 implementation-head workflows passed without retries: 68 successful
checks, six intended conditional skips, zero failed or pending checks, and
successful Vercel status. Backend full typecheck/smoke, Admin Shell, Player
Terminal and required Business/Store database/browser/connected gates passed.
The four critical authority jobs passed in [run 36949934116](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36949934116).

[Exact-head Admin run 36949934180](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36949934180),
job 110660397653, passed 25 browser checks, retained eight existing UUID-debt
exceptions, and reported zero failures. Its untouched 56957a92 baseline still
reproduces the original Market truncation. Connected Create Game/Admin and
ledger mutation, reload, replay and unauthenticated rejection passed; committed,
persisted and replay balances were all 35. No page errors were recorded.
[Sanitized artifact 11203448217](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36949934180/artifacts/11203448217)
was downloaded and verified against SHA256
`23d151ef680931e542b955fe6da721e3dd267923c5aaa93c5403ead6b0fc790f`.
These are exact implementation-head results, not mislabeled main runs.

Merged-main qualification is terminal: all 18 workflows passed; 37 checks
succeeded and six were intended conditional skips, with no failures or pending
checks. Main evidence includes [Backend 36951082417](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36951082417),
[Admin Shell 36951082545](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36951082545),
[Repository Quality 36951082525](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36951082525),
[Store cutover 36951082710](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36951082710),
[Atomic Settlement 36951082529](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36951082529)
and [code scanning 36951082772](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36951082772).
All six main Store cutover jobs passed, including full Chromium, connected
two-game journeys, replay/lint and settlement race/isolation gates. Local
merged-main Banking 14/14, Admin 91/91 and architecture checks also passed.

Main skips are production Admin switching, release publication, live-parity
enforcement/capture and dependency review. They are not live-runtime evidence.
Local browser/Edge download limitations remain accurately recorded above;
required hosted CI supplies their qualification. No deployment, migration,
cloud/credential change, dedicated Banking-browser or production acceptance is
claimed. Existing UUID debt and unverified World anchor behavior remain open
outside this bounded extraction; no assertion or financial policy was weakened.

Only this evidence, REF043's task and REF043's backlog entry change in closeout.
Other task states, dependencies, global ledger and protected owners are retained.
This records completion of the merged, qualified Banking seam, not the wider
program. The proposed ledger update requires parent review/merge. Next exact
task is REF044 after that closeout checkpoint and its own bounded preflight;
its source is untouched and remains PLANNED here.
