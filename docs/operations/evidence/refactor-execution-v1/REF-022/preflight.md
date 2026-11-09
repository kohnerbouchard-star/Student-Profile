# REF-022 Staff ledger adjustment application seam

Status: VERIFIED_COMPLETE. Base main `e388c8be26d30dae8fee32a83c17a25b286c7404`.
REF-021 is VERIFIED_COMPLETE. No open REF-022 owner exists; #668 owns context,
#736 owns Player binding. REF-015 remains blocked; REF-019/020 retain their gates.

## Historical scope and bounded merge order

The combined parity/qualification candidate exceeded the execution contract's
400-semantic-line review threshold. Split the same task into two reviewable
children; preserve all 50 parent IDs. Neither child alone completes REF-022.

- REF-022a: establish actual atomic service/RPC baseline in
  `scripts/ref-022-ledger-adjustment-acceptance.ts` and extend the existing
  `.github/workflows/ref-018-attendance-qualification.yml`. Exact editable docs:
  this record, REF-022 task and REF-022 backlog entry.
  Five meaningful files; no application source change. Qualification code is one
  harness, with loopback psql/snapshot/lock-observation mechanics reused from
  REF-018 and new ledger-specific assertions. No helper refactor or extra framework.
- REF-022b, after qualified REF-022a merges: selected Staff handler, proposed
  `economy/application/adjustLedgerForAuthorizedStaff.ts`, adjacent handler parity
  tests, existing economic invariant suite registration, and binding this harness
  to the new application. The same three docs plus its authority manifest make
  nine meaningful files; regenerated inventory is separate. The actual RPC
  acceptance must rerun on that exact implementation head before its merge.

## Frozen boundary and required acceptance

The handler already delegates to Economy's unchanged
`recordIdempotentStaffLedgerAdjustment` service and
`record_idempotent_staff_ledger_adjustment_v1` RPC. Reuse that adapter, moving only
fixed command/provenance construction. Method/config/auth, owned-game/active-player
checks, key/body parsing, rounding, errors and response mapping stay unchanged.
The request fingerprint, scoped idempotency lock, cached replay/conflict result,
`record_player_ledger_entry` call and completion stay in one transaction. Current
Banking emits two balanced ledger lines and one bank transaction per adjustment.
No SQL, amount/account/currency policy, rounding, permissions or routes change.

The disposable harness tests credit/debit, replay/conflict, denied amount/account/
currency/player/game/overdraft effects, failure inside completion after ledger and
audit writes with clean retry, and same/distinct-key races with two observed lock
waiters. It snapshots all game-scoped tables and counts every ledger/bank effect.
The transient fixture trigger is removed; no migration changes. Its loopback-only
54322 guard, explicit disposable flag and service_role transport use no hosted
credentials. Existing Attendance checks and before/after lint comparison remain.

## Historical local verification

Combined local candidate characterization passed 23 owning-suite tests before and
after extraction (20 new Staff cases), backend TypeScript, full root tests and two
Admin economic-write contracts. That unpublished candidate is not acceptance for
REF-022a or b. The qualification harness passed Deno typecheck; local Docker is
unavailable, so real R3 acceptance requires exact-head disposable CI. No mock or
other-head result counts as that proof. Parent remains IN_PROGRESS until both
children and their required evidence merge. No production or credential actions.

Qualification-only paths do not trigger Store/FX cross-cutting authority gates,
so REF-022a needs no authority manifest. REF-022b will bind its source/inventory
paths to its own PR manifest. Together the children retain the parent ten-file
meaningful budget plus generated inventory.

Initial PR776 head `59704f75eef0ae37873dcfdbe3ca61c5d095aec7`, run
`36814753758`, failed only the harness's one-audit assumption. Current unchanged
Banking SQL inserts both a bank_transaction audit and player audit. The harness
now requires exactly one of each per adjustment (two total); ledger/bank/replay/
rollback assertions remain. This failed run is historical, not acceptance.

Head `5ed6d90f86ba126fc35c56862d83bcbca6cacb2f`, run `36815285824`,
passed serial credit/debit/replay/conflict and overdraft/zero/currency rejection,
then rejected the harness assumption that a nonempty unknown account is invalid.
Existing `resolve_legacy_bank_account_v1` intentionally maps it to a legacy
identity. Denial coverage now uses the genuinely invalid empty account; accepted
account policy and SQL remain unchanged. This partial run is not acceptance.

## Qualification sequence

[PR776](https://github.com/kohnerbouchard-star/Student-Profile/pull/776) qualified
head `7ea7ecb51b1768f42bfff5c1ff3e90c2f834b9c4` and merged with an expected-head
merge as `7d75cc2e1b052b23594557f5d27422da4920ed86`. All eight runs and Vercel
passed. Run `36816045774`, job `110221207810`, artifact `11141039289`, verified
SHA256 `d473e7c2e21dc42d6b65faef0d4ef0bd6f6f99229c093a57fe35fc99d5e03c3a`,
passed every real ledger case, 208-table snapshots, rollback/retry and both races
with two observed waiters. Retained Attendance and full backend 28-root typecheck/
smoke passed. Lint remained 142 findings/17 error-level, with no added diagnostics.
This does not certify a clean database or production.

REF-022b starts from that merged main. It binds the same qualified harness to the
actual application and retains every database assertion. The existing HTTP
method/auth/ownership/player/validation/rounding/response/error boundary is
unchanged. Only fixed command construction moves to the application; the service,
RPC, SQL, package, workflow and economic policies stay unchanged. Its exact head
must independently pass all mandatory checks and real R3 acceptance before merge.

REF-022b implementation PR: #777. Exact source scope is the eight meaningful changed
paths listed in its authority manifest, plus separately generated inventory;
backlog already reads IN_PROGRESS and is unchanged. All 25 owning-suite cases
(22 Staff parity cases) passed against the unchanged merged baseline and after
extraction, including savings/nonempty account forwarding and ignored body identity.
The application adds no raw persistence call; selected RPC and whole-inventory
persistence counts remain unchanged. Inventory scans 1,257 source/test files;
persistence53/deep-imports162/transport26/compatibility209/oversized99 remain at
the accepted limits. Full actual-application R3 execution remains CI-required.

## REF-022b merged repository acceptance — 2026-10-01

[PR777](https://github.com/kohnerbouchard-star/Student-Profile/pull/777) qualified
`3bb2d9dde0393e0fd814e04b6d8f9cae08f7e7d3` and merged by expected-head-guarded
merge as `ff6c0614ca2936d6685a8b701e384e1f2a3037f2`. Both have tree
`d3127c95e8362c7acad4849e0e238e2d58635678`. All 30 exact-head automatic runs,
including 29 pull-request workflows and the dynamic PR run, plus Vercel passed.
No failures or pending checks remained. Both explicit children are now complete.

- [Actual application qualification run 36817297316](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36817297316), job `110225044985`, artifact `11142141712`, downloaded and verified SHA256 `54984897989d7acca5653c9d4a2c3ba1c3484ff4d48cbc2d27adf7529cb2085f`: every real ledger case passed. The retained JSON names the actual application and exact source, 208-table snapshots, in-RPC failure/retry, and two observed waiters for each same/distinct-key race. Baseline PR776 evidence was not substituted for this execution.
- The same artifact retains full backend typecheck of 28 Edge roots and full smoke, with all 22 Staff cases actually discovered in the 25-case owning economic suite. Retained Attendance also passed. Lint comparison remained identical at 142 findings/17 error-level; no additions or removals. This is not a clean database claim.
- [Store/FX run 36817297311](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36817297311) passed all four mandatory source/database/browser/connected jobs: `110225045439`, `110225045515`, `110225045211`, `110225045529`.
- [Repository Quality run 36817297350](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36817297350), [Backend Typecheck run 36817297437](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36817297437), and final [Store Cutover run 36817297373](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36817297373) passed, alongside retained security, architecture, Player/browser/multiplayer, economic and static release gates.

No HTTP/SQL policy or gameplay change was made to satisfy a test. The two failed
qualification fixtures above remain historical and were corrected to match the
existing two-audit and nonempty account behavior. Existing live callers remain
Staff and retained Classroom roots. The HTTP adapter no longer constructs the
atomic command; the application owns it and the unchanged service owns its one
RPC. No new persistence site, route, migration, public DTO or economic write was
introduced. Inventory counts remain as recorded above.

This closeout changes only this existing record, REF-022 task and REF-022 backlog
entry. All 50 stable IDs and the other 49 task entries remain unchanged. No new
source tests are credited to documentation. REF-015 remains blocked and
REF-019/020 retain their authentication gates. Next exact item is REF-023 (only
declared dependency REF-016, already complete), with ownership/transaction
reconciliation required before changes. No REF-023 implementation is included.

## Merged-main terminal verification

Main `ff6c0614ca2936d6685a8b701e384e1f2a3037f2` completed 16 successful runs
and one expected skipped Edge Function Inventory Convergence run `36818519323`,
with zero failures or pending runs. [Actual-application R3 run 36818519205](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36818519205),
[Backend Typecheck run 36818519240](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36818519240),
[Repository Quality run 36818519340](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36818519340)
and final [Store Cutover run 36818519398](https://github.com/kohnerbouchard-star/Student-Profile/actions/runs/36818519398)
passed. These are existing automatic post-merge checks on the identical qualified
source tree. The skipped deployment gate supplies no runtime certification; no
source suite was manually rerun for this documentation closeout.
