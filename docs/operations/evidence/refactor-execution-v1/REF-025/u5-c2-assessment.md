# REF025c2-2a — private Business sales assessment

APPROVED_SCOPE; base dc5d54dec9e24b819cfcbe46a8560d2c8e171dea. Parent independently reviews/merges.
Seven paths /390 semantic changed lines, including tests/evidence/authority:
- backend/supabase/migrations/20261004235046_add_private_business_loan_sales_assessment_v1.sql
- scripts/banking-fx-database-acceptance.sql
- scripts/business-banking-runtime-contract.mjs
- docs/operations/evidence/refactor-execution-v1/REF-025/u5-c2-assessment.md
- scripts/operations/live-migration-reconciliation/build-phase15-rehearsal-plan.mjs
- scripts/operations/live-migration-reconciliation/phase15-forward-bundle.test.mjs
- docs/operations/contracts/player-cross-cutting/pr-856.json

Pinned CLI2.109.1 generated identity20261004235046 before implementation;
empty SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
Fresh main/open-owner census: #849/#736/#735/#731/#730/#690/#668/#624/#620.
Protect context/auth/shared inventory/release ownership and REF040/REF042 paths.
Approved: immutable settled sales receipts, once each, same borrower/game/currency,
within84days bounded by captured assessment time; existing formula/product limits.
Exclude capital/IPO/loans/transfers/business FX/personal/admin credits; no period closure.
No table/column/FK/public grant/caller changes. Both creation gates and nine U1 holds stay.
Submission, authority/replay writes, disbursement, servicing and activation are separate.
Preserve submission lock/fresh-snapshot risks and explicit-mandate immutability limits.
REF025 BLOCKED; REF027 depends025+026. No hosted SQL/deployment/credential changes.
Validation pending: positive retained/funded receipts, boundaries/exclusions/isolation,
formula/product limits, disposable replay, inherited lint delta, exact-head checks.
Rollback: unmerged source revert; applied corrections require approved forward SQL.

Migration raw SHA256: 26a09c87287ff685493d8a5aec4f9e5478cd6ff49c9cb925104939bb5cc4021d.
Helper is STABLE SECURITY INVOKER, revoked from PUBLIC/anon/authenticated/service_role;
returns obligation currency/time, gross sales, existing payment/ratio and product limits.
It does not decide operator eligibility or write credit profiles. Future command owns locks,
fresh snapshots and captured time. Canonical positive settlement fixtures roll back;
predicate-unit receipt copies cover invalid game/business/currency and pre-authority rows.
Local root tests, architecture/boundary/legacy/secret checks and forward17/17 passed.
Local backend typecheck/smoke blocked by esm.sh tunnel; local DB image registration exhausted
Docker storage. CI3088e82d replayed successfully but fixture country activation was missing;
that exact fixture setup error is corrected, without changing receipt guards or policy.
Exact final-head DB/lint/full qualification pending; inherited baseline142 findings/17errors.

CI3000a895 replay/backend typecheck passed; retained Store fixture lacked the initial
Business cash projection. Added the existing canonical capital seed, still excluded
from sales income. Current-head replay/acceptance/lint remain required before review.
