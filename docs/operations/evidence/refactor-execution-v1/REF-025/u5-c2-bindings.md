# REF025c2-1 — inert Business loan bindings

APPROVED_SCOPE; base edb4fb5c9cd0a4cc1bd41f7725933cade9579e1f; parent reviews/merges.
Seven paths /350 semantic changed lines, including tests/evidence/authority:
- backend/supabase/migrations/20261004221307_prepare_business_loan_bindings_v1.sql
- scripts/banking-fx-database-acceptance.sql
- scripts/business-banking-runtime-contract.mjs
- docs/operations/evidence/refactor-execution-v1/REF-025/u5-c2-bindings.md
- scripts/operations/live-migration-reconciliation/build-phase15-rehearsal-plan.mjs
- scripts/operations/live-migration-reconciliation/phase15-forward-bundle.test.mjs
- docs/operations/contracts/player-cross-cutting/pr-855.json

Pinned CLI2.109.1 generated the unique20261004221307 identity before implementation;
initial empty SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
Fresh open owners #668/#736/#849/#730/#731/#735 have no scoped-path collision.
Preserve their context/auth/release ownership, REF040 Markets and REF042 Player paths.
User approved binding preparation and receipt-backed gross sales in obligation
currency over84days under existing limits, excluding capital/IPO/loans/transfers/
FX/personal/unclassified credits. Income implementation remains separate c2-2.
Both creation gates stay; no new table/FK/grant, origination, review, servicing or UI.
REF025 BLOCKED; REF027 depends025+026; nine U1 holds stay. No hosted SQL or release.

Implementation retains the exact effective legacy bodies with fail-closed one-marker
splicing; no economic RPC changes. New branches require canonical Business mandate,
stable business party/checking projection, matching product/business currency, and
application-to-loan identity. Captured kind/game/business/actor/product/currency/
account/application cannot change. Business/product rows and linked application use
shared locks; no new command/replay contract or concurrency certification is claimed.
Existing legacy repayment/replay probes stay. c1 shape/FK probes isolate their layer
by temporarily disabling only the new identity trigger in the outer rollback; c2
probes run with all binding/identity triggers enabled and remove gates only in a
rolled-back subtransaction. No gate-removal function or activation exists.
Local source and forward-bundle16/16 PASS; exact-head disposable replay/lint pending.
Rollback: revert unmerged source; any applied schema correction requires an approved
forward migration. Never rewrite migration history, debt or posted ledger effects.

Draft PR855; migration raw SHA256 7bf22dd6bd3d10881b52a2cab44f127d836064bf15e66b291c724ac54a094ea7.
