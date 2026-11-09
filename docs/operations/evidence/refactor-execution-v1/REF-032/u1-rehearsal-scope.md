# REF-UNBLOCK-001 / U1 rehearsal suffix accounting

Status: IMPLEMENTED_NOT_MERGED; REF-032 remains BLOCKED.
Base: `378f99849f63d044ab75029e751188a88b4ac122` (merged release hold #818).
Branch: `fix/ref032-u1-rehearsal-suffix`. Exact implementation SHA/CI are recorded
on the draft PR; parent retains review and merge authority.

The owner explicitly approved the temporary release hold and narrow U1 repair.
Parent authorized implementation after hold merge/safety verification. All nine
merged guard tests pass, the production workflow_run subscription is absent,
both merged-main Phase15 static checks passed and all eight staged/production
hosted jobs were skipped. Disposable main replay was active at preflight. No
old eligible hosted run appeared; the same 15 historical PR validations remained
queued. #730/#731 heads remain `8856648da15b821f591c09bf08a805d405dc5a96` and
`38d1124a13d22aaa2b30e8579ee8bfd9c7775dea`; neither changes these repair files.
The explicit handoff retains their release/certificate authority.

## Exact scope

Three source/test paths under `scripts/operations/live-migration-reconciliation/`:
`rehearse-live-shaped-upgrade.sh`, new `build-phase15-rehearsal-plan.mjs`, and
existing `phase15-forward-bundle.test.mjs`. Two evidence paths under this REF-032
directory: this record and generated `u1-migration-identities.json`.
One conceptual correction. Generated ordered identity evidence is separate from
the meaningful source/test review budget. No workflows, holds, historical SQL,
bundle builder, ledger verifier, live convergence runner, release certificates,
package/dependency files, application contracts, task IDs/dependencies or global
ledger changes. Existing historical evidence is retained.

## Behavior and provenance

The unchanged shell selected 152 common files and rejected them against 151.
The new plan consumes the original manifest and verifies its exact ordered rows
against the unchanged builder. The immutable bundle remains 151 staging / 169
production (18 prelude + 151 common). Both entire manifest byte digests are locked
by regressions and recorded with complete ordered identities in the generated JSON.

The only approved later suffix is migration `20260921044500` from #733. Its raw
SHA256 is `5eeaa1f631f4f532835b92f344bdafe62d6ee0690e785991e9e419f025841466`;
normalized source SHA256 is
`5c561f2bd09a2c010cb36650242c29a04d3b2ad8920043c1055db6f350d38d54`.
Missing/changed/extra later files fail before services or hosted access begin.

If separately authorized later, read-only ledger capture includes every later
version and fails closed on unknown, duplicate, non-prefix or mismatched rows.
A present suffix requires its exact name, digest and one immutable statement;
an unverified alternative ledger representation requires owner reconciliation,
not a fabricated match. Absent suffix bytes apply after the pending immutable
bundle, only to the existing disposable local target. A verified present suffix
is not reapplied. The original 151/169 summary fields continue to describe only
the immutable bundle; `postBundleSuffix` separately reports identities, remote
verification, application and certification. PASS still requires final complete
canonical schema equality. No suffix exclusion or raised bundle count.

## Qualification and remaining gates

Production/staging plan fixtures cover empty, partial, bundle-current and fully
current ledgers, plus suffix-only, gaps/order/duplicates, unknown versions,
name/digest/statement drift, changed/missing/extra files and byte-identical bundle
manifests. Shell source contracts verify validation precedes local application,
separate pending application/evidence and retained schema comparison. These are
synthetic selection/accounting tests, not real live-shaped database rehearsals.
The actual shell loop is exercised with a stub executor for both environments:
fresh, suffix-only, already-current and injected suffix failure. No SQL executes
in those fixtures. Bundle/suffix logs and failed-migration evidence are asserted.

Local qualification: 19 bundle/rehearsal/hold contracts, 29 retained release
contracts, full `npm test`, shell syntax, secret scan and diff checks pass.
Hosted capture, both actual live-shaped rehearsals, hosted convergence and
deployment: NOT_RUN under the approved hold. Clean disposable replay/lint and
exact-head CI remain required and are recorded on the PR. REF-032's required
fresh merged-main World evidence and release-owner review remain outstanding.
The repaired shell is not a newly authorized hosted-capture entry point.

Rollback: revert this repair while retaining #818's hold. Restoring automatic
execution requires separate explicit approval. Next: parent review/merge after
qualification, then separately authorized live-shaped evidence and REF-032
reconciliation; no task receives completion credit from static tests alone.
