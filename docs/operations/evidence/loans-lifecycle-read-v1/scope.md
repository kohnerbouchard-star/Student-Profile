# Loans lifecycle read v1

Roadmap item: LOANS-LIFECYCLE-READ-001. Status: IMPLEMENTED_NOT_MERGED.
Initial base: 415653b213cb1269074c212da9f97bdfd3e652f2.
Reconciled main: 7688eeebfdfcf9c81314f849e3c7dd2e47078a02.
Draft PR: https://github.com/kohnerbouchard-star/Student-Profile/pull/918.
Owner: feat/loans-lifecycle-read-v1, in an isolated checkout.

## Approved boundary

The owner requested richer Loans/Business/Banking capabilities in a separate PR
without changing current work, accepted Loans lifecycle backend groundwork first,
and explicitly approved a small intake addition on the new branch to the shared
roadmap. Existing branches and #668's ledger ownership remain unchanged. UI is
deferred. This is not REF-025 activation or a repayment-forecast tranche.

Preserve all existing Loans response fields and transaction behavior. Add only
versioned recorded application/facility/payment data and per-currency recorded
debt. Keep internal UUIDs, staff notes/identities, purpose, repayment-source text,
idempotency keys, request hashes and ledger IDs out of the new DTO. No schema,
migration, RPC, route, policy, auth, release configuration or hosted-data writes.

## Scope and coordination

Expected editable paths are the existing Business-banking contracts, Loans
repository and loan currency projection module; its retained route test; one new focused test script;
one new PR-only read-only verification workflow; this document; the bounded
roadmap entry; and the actual-numbered PR918 authority manifest. No new
backend source file is planned. Existing package manifests, inventory, shared
workflows, #624 UI, #888 diagnostic tools and other PR authority files are excluded.
All 20 open PR file lists were inspected. These three source paths are unowned;
#620 overlaps the existing Business Banking workflow, so it remains untouched.
The existing global roadmap is the only approved supporting owner overlap.
If generated inventory changes or another shared path becomes necessary, stop
and obtain a bounded disposition rather than weakening a gate.

## Intended semantics

This is a bounded recent-records read, not a complete lifecycle-event timeline or
an atomic multi-table snapshot. Each collection returns at most 100 entries,
requesting an exact database count and a 101st row. Missing/inconsistent counts
or server under-return prevent completeness; an unknown hasMore stays null.
No new pagination route is claimed.
Coverage and data validity must be explicit; truncated debt is unavailable,
not a partial sum presented as total debt. Exact numeric text/bigint cents
preserve money; currencies are never summed or converted into each other.
Recorded interest is stored interest as of each loan's last-accrual timestamp,
not accrued-to-now interest or a payoff quote. Default does not erase debt.
Paid rows with positive recorded debt must be flagged, not silently hidden.
Applications lack a locked currency in the retained schema: current product
currency is metadata, not the historical application obligation currency.
Payments get currency only from a separately scoped associated loan and retain
posted/reversed status and nullable installment-allocation timestamps.
An unavailable added read is explicit without breaking the old snapshot. Added
queries start only after the original five reads succeed. A 2000ms deadline
returns unavailable, aborts all added queries and prevents late completions from
starting metadata lookups. The original reads and mutation commands are untouched.

## Verification

Pinned tools: Node 22.23.1, npm 10.9.8, Deno 2.9.3. Locked dependencies were installed
only in this isolated checkout. Source implementation and synthetic tests are
not hosted PostgREST, RLS or database/runtime certification.

Initial implementation passed all 57 focused tests, full root npm test, backend
TypeScript/all 28 Edge roots, full backend smoke (1422 Deno and 18 Node cases),
complete Player verification and retained Business/Banking runtime/surface checks.
Root retains one existing GNU-tar platform skip on macOS.

The first combined Loans test run preserved 57 new passes and 10 retained passes,
but the retained five-read fixture rejected the newly added read calls. Its
fixture now explicitly isolates unavailable counted-history reads and removes
only additive lifecycle from its retained response comparison. Every original
five-query expected entry, currency assertion and retained DTO expected value
is unchanged. New scoped history assertions live in the new dedicated suite.

Independent read-only review found a P2 unbounded optional-history
wait, corrected with the deadline/cancellation above. A further synthetic delayed
response test reproduced late metadata lookups after timeout (68 passed/1 failed),
corrected by checking cancellation before each following stage. Failures remain
historical evidence, not relabelled passes. Final focused and independent re-review results are 80/80 passing with Deno 2.9.3:
69 new tests and 11 retained route/currency tests. The independent reviewer found
no remaining actionable issue. No executed reproduction against the original
unbounded source is claimed.

Final source 8e4aee65a1b2199b28bba51cc7d71bff4192fa76 passed a fresh complete
root npm test, Player verification, backend TypeScript/all 28 Edge roots and
full backend smoke (1422 Deno plus 18 Node cases) after the cancellation guards.
The same one GNU-tar platform skip remains. Authority/action-pinning/promotion
regressions pass 18/18; generated inventory is byte-unchanged, with all debt
measurements and ceilings unchanged. No package, shared workflow or verifier
source changed. Hosted CI remains pending; no merge-ready, live or completion
credit is claimed. Actual PR identity and exact-head results follow publication.

## Actual PR binding and main reconciliation

Draft PR918 initially published head d3a228e26ea2ba7aa9fd466e73b0ba28d619814c.
Immediately before publication, main advanced through merged #913 to
7688eeebfdfcf9c81314f849e3c7dd2e47078a02. Normal forward merge preserved the
entire new main roadmap verbatim with only this approved intake entry added.
All Loans implementation and focused/retained test files are byte-identical to
reviewed source 8e4aee65a1b2199b28bba51cc7d71bff4192fa76. Fresh full root and
complete Player verification pass on that reconciled base.

Actual-numbered pr-918.json binds nine edited paths under eleven locks. Its
118 required and 87 critical checks preserve every predecessor 117/86 check
from accepted PR912 and PR913, adding only Loans Lifecycle Read to both.
The authority verifier and its regression tests remain read-only. Only the new
Loans workflow selects the new exact authority path; no shared workflow selector
is changed. Missing retained checks are not waived. Exact-head hosted results
remain pending after this metadata amendment; final qualification is reported
against the verified remote SHA, not a preceding head. Independent metadata
review found no actionable finding, confirmed all nine paths and preserved
source/roadmap/check arrays, and passed actual authority verification, six
negative PR/base/path/safety variants and all 16 unchanged authority regressions.

## Rollback and release

Revert this isolated read enrichment to remove the additive field; no schema,
ledger, balance, payment, application, liability or gate state changes. No new
public route, mutation permission or audit-write behavior exists. Existing
request authentication/rate boundaries remain; reads add only bounded scoped
queries and a cancellation deadline. Publication is as a separate draft PR only.
No merge, ready transition, auto-merge, production/live action, release dispatch,
secret change or other existing branch modification is authorized here.
