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

## Implementation and qualification checkpoint

Registration commit db035d47 preceded implementation. The seven-path candidate
contains only the three-read extraction and its supporting registration/tests.
The physical patch before this results appendix is474 additions/deletions,
including294 lines of formatted adversarial fixtures and45 scope lines; copied
query/type declarations and test formatting are mechanical, not added runtime
behavior. This is one conceptual change, not400 physical lines or a broad
reformat. Existing handler formatting and intentional imports stay untouched.

Pinned Node22.23.1/npm10.9.8/Deno2.9.3 were installed under /tmp/attendance-tools
with a writable temporary npm cache; lockfile installs changed no repository lock.
Focused production-handler/repository tests7/7 PASS; the identical seven tests
also PASS against pristine main's original handler, proving characterized parity.
Cases include method/environment/Staff/game denial, complete ordered query traces,
projection/filter/date/null/empty behavior, each returned/thrown read failure,
short-circuiting, orphan-record exclusion and safe errors. No database was used.
Independent read-only review found no actionable source issue and independently
passed7/7 focused tests and backend TypeScript; parsed package/inventory guards
confirmed only authorized changes. No other owner's consent was inferred.

Full root npm test PASS. Backend typecheck:all PASS, including all28 Edge roots.
Initial typecheck/smoke attempts reached the default read-only Deno cache; those
failures are retained in /tmp/attendance-typecheck.log and attendance-smoke.log.
A writable DENO_DIR=/tmp/attendance-deno-cache resolved the environment issue
without changing frozen dependencies, test assertions, network/security policy or
source. Full smoke rerun is recorded separately at final closeout below.
Architecture/high-priority/legacy/secrets/staged-whitespace checks PASS.
New-file format checks PASS; unchanged existing handler format debt is retained.
Inventory reproduced twice byte-identically, SHA256
467f2e9f8ca9c5c353c74e3b88beed6e14d2fd4b31539a07c1230b035fe92ec5.
Parsed guards prove exactly the four allowed Attendance changes, all other fields
identical to main. No database/browser/connected/hosted acceptance was run; source
and synthetic qualification do not certify live operation or REF/ARCH completion.

Final writable-cache backend smoke PASS, including the newly registered7 daily
checks after existing neutral-config/domain/Admin suites. All28 Edge roots and
full root tests passed on this same runtime/test/package source. Remote main and
#668 heads and all four protected blobs were rechecked unchanged before commit.
Exact source patch SHA256 (Attendance runtime/contract/repository/tests):
9b4dfae0ac29d6ee66556efc4c9c1dbf0c04e6db56eaa215f076e743f4d54b77.
No remaining local implementation blocker; hosted CI and parent publication
review remain outstanding. No merge/deployment or live certification is claimed.
