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

## Parent-approved hosted qualification amendment

Initial draft PR916 source987a2453 remains preserved with its failing hosted
results: Banking source127768463541 rejected missing actual-PR authority;
Repository Quality127768462757 rejected stale supporting package identity.
This amendment extends the seven-path scope to nine paths only: actual
 docs/operations/contracts/player-cross-cutting/pr-916.json and three package
sourceEvidenceBlobs values in REF003/candidates.json. No runtime/test/package or
inventory bytes change. PR912's117 required/86 critical entries, two read-only
locks and all false safety flags are copied verbatim; nine actual paths stay
under eleven exact locks. No workflow/verifier/policy changes or waived gates.

Before edits main767bc0e8, draft916/987a2453, #668/faaf908b and
#885/8530faae8813200dce8b037946519dc8c29ac297 were reverified. Fresh23-open-PR
full-path census finds only #885 overlapping the added receipt path, no new
manifest owner. Current-main receipt blob4589dc191d138fbe242ba51c006e481588643c94
and #885 receipt blobc12ba0e141c5c7e84d6c02ebf876f2ee3f868db8 were compared.
#885's reviewed hunks rebind compiler-config identities; current main already
contains those target identities. Its main-relative stale Settings differences
must not be imported. Only three existing package references change from
8f8fe07cb0e446a121fcbc519cb692447c2e1b68 to actual unchanged final package blob
01e8517103cdd62ca3ba6a7bc5046189ac2a97b3. Every compiler/Settings identity, review,
disposition and unrelated field stays current-main identical. This preserves
#885 intent without copying its file or claiming consent. Later integration
must preserve these package receipts while reconciling actual combined source.

Original required workflows not triggered remain unqualified, not waived.
No duplicate dispatch, rerun, filter change, merge, ready transition, auto-merge,
deployment, hosted mutation or release-hold change is authorized.

## Parent-authorized local Click Safety runner amendment — 2026-11-09

Scope is local preparation/review only; no push, PR metadata change or dispatch.
Exactly three editable paths: .github/workflows/player-button-click-safety.yml,
docs/operations/contracts/player-cross-cutting/pr-916.json, and this scoped record.
No older four-gap workflow proposal is activated. Parent authorizes the same
supported-runner pin already published in #914; no owner consent is inferred.

Before edits main767bc0e8998d548b2cb0de9e649000fe23f92630 and remote916/head
0c9bdc2b5294da0ec515b88a3c915376e4ae4a50 are unchanged. #914 is
5b257c38e7ae6745d114d1255f01455dd787f9fd; #620 is
ffa650267b6bf20c69d1c6217b31d51616c25363. Workflow blobs: current/main
b9e8cad0013b787a6933fc219cae55c999ce7cda; #914493e7f62931ee8aa5fbf6c3e6e0c11f16cd174ab;
#62054f1c143f736f9bacca587f701385ca300c240ed. Existing authority/scope blobs are
d513cdc424c15ca14afef0b04a65490e3b688697/f0fe4caeade2a9c51bec49cbe629a8472f41ba6e.
Fresh23-open-PR full-path census: #914/#620 overlap the selected workflow;
#916 owns its authority/evidence. #914 changes only ubuntu-latest to ubuntu-24.04;
#620 changes only upload-artifact v4 to v7. Preserve all unrelated action pins,
selectors/checkout guards, commands, test/browser versions, fixtures and timeouts.
No #914 file/check or other owner branch is changed. #668/#885 protections hold.

Actual manual runs all use old head0c9bdc2b on this Attendance branch:
-42535387023 Multiplayer/Load: success; all connected journeys, 30/40-player
 profiles/enforcement/cleanup pass; final load JSON reports serverErrors0.
-42535459589 Button Action Coverage: success; wiring and ledger checks pass;
 connected release-enforcement step stays skipped (release_gate=false).
-42535550192 Environment Neutral Browser: success; all three source/syntax
 validations and final enforcement pass.
-42535503886 Click Safety/job128898804280: failure at Install Chromium before
 button tests. Exact log: Playwright does not support chromium on ubuntu26.04-x64.
 Runner ubuntu-latest selected unsupported26.04. No assertion/access failure is
 inferred; the button-sweep step is skipped. Preserve this failure as history.

Only change runs-on to ubuntu-24.04 and add the existing workflow path to the
actual PR916 allowlist:10 actual changed paths under12 locks. Preserve117 required,
86 critical entries, both read-only locks, all false safety flags and every other
manifest value. The workflow already names its own file in pull_request.paths;
no selector addition is required. A later approved real patch push should trigger
the unchanged Click Safety test automatically on its amended SHA. Do not use an
empty commit or bypass the denied CLI dispatch route. User-run checks do not
establish our CLI access recovery. All three passing manuals remain old-head
proof, not automatic qualification for any proposed amended SHA.

Required local verification: YAML/structural equality except runs-on, exact
one-line workflow diff matching #914, unchanged authority verifier/regressions,
positive/negative scope/identity/safety cases, and secrets/whitespace checks with
pinned tooling. Independent review of the complete exact amendment is required.
Future publication/hosted acceptance remains separately parent-controlled.

Local verification PASS with Node22.23.1/npm10.9.8 and YAML parser2.8.2 installed
outside the repository: YAML parsed without errors; complete parsed workflow
compares identical except runs-on; exact one-line diff/result blob matches #914.
Unchanged CLI authority verifier accepts10 paths/12 locks; all manifest fields
other than the single appended allowed path compare identical; six negative
scope/identity/safety mutations reject. Authority/action-pinning regressions17/17,
secret scan and whitespace PASS. Independent read-only review found no actionable
finding and independently passed authority16/16, YAML/equality and negative guards.
No browser, dependency-install or hosted rerun was performed locally; the actual
supported-runner browser execution remains NOT_RUN pending parent publication.


## Parent-authorized current-main integration — 2026-11-09

Normal merge of main415653b213cb1269074c212da9f97bdfd3e652f2 into published
Attendance480cb88322594b3b37ba8161cd613d257ea1b2b6; no history rewrite or
force-push. Main contains merged Marketplace PR914/head5b257c38e7ae6745d114d1255f01455dd787f9fd.
The no-commit merge was clean: no conflicting hunks and no manual resolutions.
Every imported main path remains byte-identical to main. All Attendance runtime,
contract, test, backend package, PR916 manifest and REF003 receipt bytes remain
identical to the independently reviewed predecessor. Only this scoped evidence
record is amended beyond the automatic merge. No new workflow proposal is applied.

Fresh complete census covered20 open PRs. Existing package/inventory overlap with
#668, receipt/inventory overlap with#885 and action-pin overlap with#620 are
preserved, not acquired. #913/#915 own independent Player changes; their shared
package/Atomic workflow paths are imported only from already merged main, never
from their unmerged branches. No owner consent is inferred and no other checkout
or branch is modified. Global roadmaps remain protected and are not edited.
This continues the bounded Attendance daily-read context/database seam; completed
REF018 and gated REF019/ARCH100H are not activated or claimed complete.

Pre-integration main package/inventory/receipt blobs:
8f8fe07cb0e446a121fcbc519cb692447c2e1b68 /
b6865fc38ebec932558e058eab9ded78077aba12 /
4589dc191d138fbe242ba51c006e481588643c94.
Current-base diff has nine Attendance/supporting paths: the Click workflow is now
identical to merged main. PR916 authority already binds main by ref, not a base
commit hash; unchanged verifier accepts9 changed paths under12 exact locks.
All117 required/86 critical entries, both read-only locks and false flags remain
byte-unchanged. Positive scope and six wrong-PR/base/path/safety mutations pass.
All three package receipts still bind actual package01e8517103cdd62ca3ba6a7bc5046189ac2a97b3.

Inventory was regenerated twice from this combined tree, byte-identically:
SHA256467f2e9f8ca9c5c353c74e3b88beed6e14d2fd4b31539a07c1230b035fe92ec5.
It retains1315 source files, Attendance15, persistence exceptions53, cross-domain
imports70 and zero foreign-infrastructure debt. Main-relative changes remain only
the original Attendance counts and removal of the daily handler exception.
No ceilings or unrelated measurements were changed or manually forced.

Prior-head480cb883 hosted results are historical: Click Safety16/16 and31 successful
workflows; eight browser workflows failed Chromium installation on unsupported
Ubuntu26.04, and Seed failed its current-main ancestry guard after main advanced.
Those failures are not rewritten as passes. Old0c9 manual results likewise do not
qualify this integration. New exact-head automatic qualification is required.
No manual dispatch/retry, access bypass, release/production action, hosted mutation
or credentials/settings change is authorized; PR916 stays draft with auto-merge off.

Pinned local tools are Node22.23.1/npm10.9.8/Deno2.9.3, installed outside the
repository with writable temporary caches and unchanged frozen locks. Root/backend
npm ci PASS; focused Attendance7/7 PASS; full root npm test PASS; backend TypeScript
and all28 Edge roots PASS; Player verify PASS including imported Marketplace
ownership regressions. Authority/action-pinning/receipt/ratchet regressions72/72,
actual-base authority, package-identity/preservation guards, secrets and whitespace
PASS. Backend smoke and independent review are recorded at final closeout.

Final local backend smoke PASS with the same frozen source and pinned tools,
including the seven daily tests. Independent read-only merge review found no
actionable issue; it independently verified both-parent preservation, unchanged
Attendance source/package/receipts/manifest, exact inventory deltas and authority
positive/six-negative checks. Full root/Edge/Player/smoke execution is implementation
provided evidence, not represented as independently rerun. No local database or
browser/hosted acceptance is claimed; automatic final-head CI follows publication.
