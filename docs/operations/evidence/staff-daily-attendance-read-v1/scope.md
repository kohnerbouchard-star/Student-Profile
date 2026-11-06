# Staff daily Attendance read extraction

Parent-authorized bounded non-overlap; not #668 owner acknowledgement.
Base main: 767bc0e8998d548b2cb0de9e649000fe23f92630.
Existing #668 head: faaf908bdd5131b451c7e87e91ed4991ad8f839d.
Main package/inventory blobs: 8f8fe07cb0e446a121fcbc519cb692447c2e1b68 / b6865fc38ebec932558e058eab9ded78077aba12.
#668 package/inventory blobs: 6d9d8abd09e54fd0e1b9cfbcfc3170e180310d8f / 8975e477826aabd7a9eee8a6fd7cc55f504c34b5.
Fresh complete path census:22 open PRs, no Attendance source overlap.

Exactly seven editable paths:
- backend/src/domains/attendance/api/staffAttendanceDailyHttpHandler.ts
- backend/src/domains/attendance/contracts/staffAttendanceDailyReadRepository.ts (new)
- backend/src/domains/attendance/infrastructure/supabaseStaffAttendanceDailyReadRepository.ts (new)
- backend/src/domains/attendance/tests/staffAttendanceDailyRead.test.ts (new)
- backend/package.json
- docs/architecture/inventories/econovaria-architecture-inventory-v2.json
- this scope/evidence record

Only move the three sequential settings/active-roster/dated-attendance reads
behind an Attendance-owned read contract. Keep method/environment/auth/owned-game
checks before domain reads, exact scalar predicates, selected fields, ordering,
query failure short-circuiting, null/empty behavior, config/date interpretation,
DTO composition, safe errors and generatedAt behavior. No writes, context
propagation, reward/clock-in/policy change, SQL, shared root, generic framework,
intentional test-import cleanup, global ledger or other-owner implementation.
This is independent of completed REF018 and gated ARCH100H/REF019.
Budget: seven paths, three new scanned sources, under400 semantic changed lines.

Package exception: add test:staff-attendance-daily with restricted synthetic env,
neutral Deno config/frozen lock and deny-net; append only its call to smoke.
All other existing script values remain identical. #668 test:smoke and
 test:staff-bootstrap are untouched. No dependency/lock/workflow changes.
Generated inventory must reproduce twice with only total1312->1315, Attendance
12->15, persistence54->53 and removal of this handler's persistence exception.
Unexpected deltas stop integration; never force counts or change ceilings.
Later #668 reconciliation must preserve this registration and regenerate the
actual combined tree, never restore its stale generated snapshot/package.
Recheck both refs/protected blobs before commit; stop on concurrent changes.

Validation: production handler/repository fake-client traces, authorization and
all read failures, empty/null and projection/date semantics; pinned focused suite,
backend typecheck/smoke, root tests, architecture/high-priority/legacy/secrets/diff.
Missing tools/evidence are BLOCKED/NOT_RUN. Independent read-only review required.
Rollback: revert only this bounded source/registration/inventory patch; no state
changes. No publication, merge, deployment, hosted mutation or release credit.
