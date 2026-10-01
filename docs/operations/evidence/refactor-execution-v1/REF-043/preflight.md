# REF-043 — Banking response extraction blocked by browser baseline

Status: BLOCKED. Repository qualification only; no deployment or runtime claim.

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
