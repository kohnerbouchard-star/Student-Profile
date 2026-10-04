# REF-040 — U6a interim closeout

## Outcome and exact scope

Approved D3-A stabilization only: retained isolated calculations, owning numerical
characterization and accepted accountable D3-B handoff. The original public seam
used by actual production consumers remains **undelivered**. This is not retention
masquerading as integration, financial-product certification or runtime activation.
The [approved addendum](../../../../roadmaps/refactor-execution-v1/BLOCKER-RESOLUTION-ADDENDUM.md#d3--approved-staged-markets-integration)
permits this explicit interim reconciliation. Parent reviews and merges this draft.

Read-only base: `8a33ce0ce122115bc06ae525f5ab5d08d4daf557` (2026-10-04).
The additional PR #834 loan characterization does not alter the Markets family or
accepted handoff. Editable paths, limited to three files and under 400 semantic lines:

- `docs/roadmaps/refactor-execution-v1/tasks/REF-040.md`: historical versus interim outcome.
- `docs/roadmaps/refactor-execution-v1/backlog.json`: REF-040 object only.
- This new evidence file, `docs/operations/evidence/refactor-execution-v1/REF-040/u6a-closeout.md`.

No source/test, public barrel, consumer, formula, migration, shared registry,
workflow, credential, deployment or runtime change. REF-042 and CampusPay are
untouched. Historical [preflight](preflight.md), [initial amendment](u6a-interim-outcome.md)
and [characterization evidence](u6a-qualification.md) remain byte-identical.

## Merged evidence and source identity

| Accepted tranche | Reviewed head | Actual main merge |
|---|---|---|
| [PR #830](https://github.com/kohnerbouchard-star/Student-Profile/pull/830), interim amendment | `25a038e46748758b6526da58e0d9dbd9754af59b` | `d032df9fcb7aadd63d03d5af7bd9210cb92db994` |
| [PR #831](https://github.com/kohnerbouchard-star/Student-Profile/pull/831), 11 added characterization cases | `1b1ae02b932499d06f0459e04319b716da543f60` | `b7f0e1374163f665124cc2ff02e9f4313ccb6679` |
| [PR #833](https://github.com/kohnerbouchard-star/Student-Profile/pull/833), accepted continuation handoff | `4524dbe2bcf745007025a58641c6579f5d01869f` | `55cad19055484f81f10ff15bc2571d6c25995d5c` |

The manifest's implementation/merge fields identify the actual merged test tranche,
not a prospective closeout merge. The additional handoff merge is recorded above.
Fresh diff confirms all `backend/src/domains/markets` files and Stock engine tests
are unchanged from qualified merge `b7f0e13` to this base. PR #833's authority file
matches its reviewed head exactly at both its merge and this base.

Fresh tracked-source scan (`rg` for bondMath, callableBondPolicy and
fixedIncomeAnalytics) retains exactly three direct bondMath importers: its test,
callableBondPolicy and fixedIncomeAnalytics. The two internal helpers have test
consumers only. Zero external production consumers and zero public Markets indexes.
Runtime dependency closure remains bondMath + decimalMath, with type-only
financialMarketContracts; no module initialization IO. No code-deletion conclusion
follows from this isolation. Before/after caller/dependency counts are unchanged.

## Qualification, with source limits

Existing [PR #831 exact-head Markets job](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36976477617/job/110741303767)
checks out `1b1ae02b`; actual diagnostics were inspected, not only its green badge:
147 Markets and 31 Stock tests, TypeScript plus 28 Edge roots, and full backend
smoke (1,355 cases, zero failures) passed. Local frozen-lock characterization also
passed 147 Markets, 31 Stock, 73 market-assets and 67 calendar tests. The original
local full backend attempt remained blocked on the pinned esm.sh download; its 879
preceding smoke cases were partial evidence, not substituted for CI qualification.

[Main qualification at b7f0e13](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36977474845)
also passed: inspected typecheck artifact 11214310326, SHA-256
`e3065bbe8be7007cf663dadbe77a19b0c84b46875d88221a542de9c1c40b57a8`,
and smoke artifact 11213718920, SHA-256
`0217656450f0e64741e37ba7e66e33318c688a628d70bec625ddad47e63573cc`;
status zero, all 28 Edge roots and 1,355 smoke cases/zero failures.
The [PR #833 exact-head Markets job](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36979224715/job/110749706715)
repeated 147/31, full typecheck and smoke successfully at `4524dbe2`.
These remain evidence for their named source identities, not claimed backend runs
at this documentation head. The docs-only closeout earns no new backend/runtime credit.

Merged handoff `55cad190` has seven terminal successful runs: Repository Quality
37168935395; Supply Chain 37168935366; Beta Pilot 37168935392; Beta Security
37168935414; Required Game Market Timezone 37168935419; Production Git Release
37168935425; CodeQL 37168934711. The [release run](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/37168935425)
passed its tokenless contract job; all four staging/production capture and publish
gates were skipped. This is not a deployment or release certificate.

Fresh local checks on base `8a33ce0c` plus these documentation changes: Deno 2.9.3
`deno test --config backend/supabase/functions/deno.json --lock=backend/supabase/functions/deno.lock --frozen backend/src/domains/markets`
passed 147/0 (exit 0); Node 22.23.1/npm 10.9.8 `npm test` and
`npm run security:secrets` each exited 0. Official Deno archive SHA-256 was verified
as `8101865641cbede56f08ad19c0a67a87df84bce127fee0d3e3e1f7467717ffa6`.
Processes used disposable caches and an environment excluding live credentials.
Full backend typecheck/smoke was not rerun locally for this docs-only closeout.
Document/link/JSON/dependency/scope results, exact published head and terminal CI
are attached to the draft PR. No staging,
authenticated lifecycle, live DB, production capture or release was attempted.
The existing nine literal-false hosted guards and removed automatic production
chain remain unchanged; disposable rehearsal does not certify a release.

## Accountable outstanding integration

The [accepted allocation](../../../../markets/full-financial-markets-expansion-authority-v1.md#bounded-continuation-registration--2026-10-02)
names **dot's Econovaria Markets continuation** as implementation lead. The user
retains product-policy and explicit release authorization. The parent coordinates
scope, independent review, merge and reviewed release execution. Its former
"awaits review/merge" prose describes PR #833's pre-merge state; the accepted merge
above resolves that bounded handoff, not broader controller registration.

All six milestones remain PLANNED, sequentially owned by that lead:

| Milestone | Outstanding requirement / exit |
|---|---|
| EXP-MKT-011 | Reviewed contract/caller plan, numerical/error parity and minimal public seam only with real consumers. |
| EXP-MKT-012 | After 011 and product decisions: authoritative terms/offer, approved instrument/issuer/definitions. |
| EXP-MKT-013 | After 012 and funding/controller gates: atomic funded allocation/holdings, concurrency, replay and rollback proof. |
| EXP-MKT-014 | After 013 and failure/recovery decisions: payments, redemption and failure lifecycle; resolve affected recovery behavior. |
| EXP-MKT-015 | After 014 and API/capability coordination: real public consumers, receipts/history, privacy and refresh/remount proof. |
| EXP-MKT-016 | After 015: full exact-source numerical/security/backend/authenticated lifecycle and staging/rollback evidence, then separately authorized release. |

The authority document retains detailed prerequisites, design references and exits;
this table does not replace or weaken them. EXP-MKT-001–010 remain unreconciled and
unchanged; the six-row allocation was newly accepted, not invented historical mapping.
Broader authority remains AUTHORITY_REGISTRATION_PENDING_CONTROLLER. U6b still
requires exclusive migration allocation, shared-file collision/merge coordination,
capability/API responsibilities, canonical Stocks/Markets/Banking ownership and
release-train decisions. Instrument, issuer, funding/liability, terms/currency,
rate/date conventions and failure/default/recovery remain user decisions. A
one-currency fixed-rate bond is only a candidate. No shared registration is taken over.

**Recovery caveat:** any non-null `recoveredAt`, including malformed, impossible,
future or empty values, suppresses recovery flows without validation/comparison
while retaining recovery valuation. The tests characterize a potential defect;
they do not approve it. The continuation lead owns a separate product decision and
bounded resolution with regression evidence before affected recovery consumers.
Early-zero accrued-interest validation ordering, month-clamp carry and continuous
versus periodic discount conventions are likewise preserved, not selected policy.
Broader fixed-income/callable coverage is not claimed exhaustive.

## Disposition and next gate

REF-040's proposed VERIFIED_COMPLETE disposition is explicitly the approved U6a
interim outcome, supported by already merged characterization and accepted handoff.
The original public-consumer outcome remains unmet under D3-B. REF-038 is complete;
all 50 IDs/dependency edges and every other task object remain unchanged. This
closeout proposes one credit, 35 to 36, effective only after parent acceptance and
merge. It neither closes the expansion nor certifies REF-050 or production.

Next: parent exact-head review/merge of this draft, then separately scoped
EXP-MKT-011 kickoff under the accepted lead and applicable decisions. Recheck the
handoff at that kickoff and before REF-050 certification; do not silently erase
integration from certification exclusions. Rollback reverts only the three closeout
records, preserving all calculation tests, historical evidence and release holds.
