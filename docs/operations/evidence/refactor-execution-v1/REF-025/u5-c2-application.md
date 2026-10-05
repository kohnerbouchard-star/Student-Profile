# REF025c2-2b — gated Business application submission

APPROVED_SCOPE; base fc69e9e8af81d080e467b554d1bfe3594d335510; parent independently reviews/merges.
Seven paths /390 semantic changed lines, including tests/evidence/authority:
- backend/supabase/migrations/20261005004013_add_gated_business_loan_submission_v1.sql
- scripts/banking-fx-database-acceptance.sql
- scripts/business-banking-runtime-contract.mjs
- docs/operations/evidence/refactor-execution-v1/REF-025/u5-c2-application.md
- scripts/operations/live-migration-reconciliation/build-phase15-rehearsal-plan.mjs
- scripts/operations/live-migration-reconciliation/phase15-forward-bundle.test.mjs
- docs/operations/contracts/player-cross-cutting/pr-858.json

Pinned CLI2.109.1 generated20261005004013 before implementation; initial empty SHA256
 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
Fresh open-owner/path census #857/#849/#736/#735/#731/#730/#690/#668/#624/#620: no collision.
Protect their context/auth/shared-inventory/release ownership and REF040/REF042 paths.
Add only a partial Business request index and private command, without table/column/FK,
public grants or callers. Preserve existing player-key uniqueness and legacy command.
Approved successor replay rechecks current authority, preserves original initiator and
assessment, rejects removed operators and changed canonical payload/key collisions.
Payload version binds game/business/product key, rounded amount, trimmed purpose,
canonical Business repayment account type and currency; actor/product terms are not replay inputs.

Require READ COMMITTED. Lock active game/player SHARE, borrower UPDATE; re-resolve
canonical authority after that lock, then replay before mutable product/account eligibility.
For creation lock product, Business party and checking account SHARE; capture server time
and call the STABLE assessment in a subsequent statement. Profile/application/audit are atomic.
This gives a defined authorization check, NOT global exactly-one-business serialization
through commit: another-business ownership writer can still change that global predicate.
No new global authority mutex, stronger-isolation support or multi-session race proof is claimed.
Those races and the complete interacting lock graph remain required before activation.
Both creation CHECK gates and all nine U1 holds stay. Serial positive tests remove only
application gate inside an injected-rollback subtransaction; no persistent gate change.
No review/disbursement/repayment/default/UI activation. REF025 BLOCKED; REF027 depends025+026.
No hosted SQL/deployment/credential actions. Validation and exact forward hashes pending.
Rollback: revert unmerged source; applied changes require an approved forward correction.

Registered migration raw SHA256 e9ab53f6d86cfe0712c5366ee8f174b7331a23ddcb210056d0bd4bd3f6b77ab2.

Head33e648ee Banking-FX job111572768452 failed in the disposable acceptance assertion:
unqualified audit action conflicted with the outer fixture variable. Qualify audit columns;
assertion semantics and migration remain unchanged. Corrected-head qualification required.
Review also identified two incorrect governance fixture column names; use existing
approval_threshold_basis_points/snapshot_total_voting_units, with no schema change.
