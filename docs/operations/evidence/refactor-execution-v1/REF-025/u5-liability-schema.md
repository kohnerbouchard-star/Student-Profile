# REF025c1 — inert liability schema

Base `b628d439158576bf38b2c30420eeec3e1e94407e`; parent-approved seven paths /350 semantic lines.
REF025 BLOCKED; REF027 depends025+026. No business origination, repayment, servicing,
read/UI activation or completion credit. All nine U1 guards remain; parent reviews/merges.

CLI2.109.1 generated `backend/supabase/migrations/20261004145731_add_loan_liability_contract_v1.sql`
in a disposable container (workspace CLI cache is read-only). Empty-file registration
SHA256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
SQL SHA256: `9aaafa96b25d981d1bfece7ed1f64c185a0f8c0c35ca774fa09a23adfcacd5e0`.
Fresh-main migration validator:450 unique versions; no active PR owns this identity.

Both tables default to legacy_v1; old business-linked rows remain legacy liabilities.
Nullable internal actor/business identities and application currency have shape checks,
composite game-scoped FKs and supporting indexes. Existing loan currency/account/RPCs,
terms and repayment rights stay unchanged; no grants/RLS or historical migration changes.
Named validated CHECK gates on both tables permit only legacy_v1, including service-role
writes. c2-c4 cannot remove them; c5 requires separately accepted complete qualification.
Internal types are not browser DTOs. c2 income/capitalization/IPO classification stays
unresolved; no qualifying-income, guarantee, default, debt-transfer or FX policy added.

Registered tests extend the existing Banking/FX SQL acceptance and runtime source check.
Disposable acceptance tests old inserts/defaults and legacy business repayment/replay;
postgres/service-role INSERT+UPDATE must fail by the exact gate constraint name.
Inside the rollback-only test transaction, gate and then shape are removed separately
so shape and actual cross-game FKs are tested independently. Same-game identities pass.
Rollback restores all four CHECK constraints and removes fixtures. Loan RLS/ACL checks
join the existing banking checks. No weakened assertions or workflow changes.

Local migration/source validation and whitespace PASS. Full local Supabase replay blocked:
ECR pull forbidden; fallback pinned17.6.1.143 image exhausted Docker daemon storage.
This is NOT database qualification. Exact-head CI full replay twice, lint, existing
Banking/FX/loan/backend/Player/connected checks remain required before review/merge.
No live SQL, credentials/settings, deployment or hold restoration occurred.
Rollback uses a reviewed forward schema correction; never erase obligations or ledger.
Fresh ownership: #668/#849 backend manifest, #668/#736/#849 inventory, #624 UI; protected
Player/context/auth/Markets paths unchanged. Root checks regenerate inventory: the explicit
legacy_v1 internal discriminant adds one compatibility-marker file (209->210). The baseline
ceiling stays209. Qualification is BLOCKED pending parent scope/owner disposition; no
baseline edit or lexical workaround is authorized. Generated inventory is not yet committed.

## Registered additional evidence tranche
User-approved Business-banking/test scope: three paths /250 semantic changed lines:
- `scripts/banking-fx-database-acceptance.sql`
- `scripts/banking-fx-database-acceptance.mjs`
- `docs/operations/evidence/refactor-execution-v1/REF-025/u5-liability-schema.md`
Prove valid business shape with shape enabled; actor/business equality and currency
normalization independently; populated pre-migration personal/business legacy rows;
injected migration failure/no partial schema and retry. Disposable only; no c2 policy.

Additional source-ready evidence: personal and business loans are populated after
transactionally reconstructing only the pre-c1 table shape on the full-chain database.
Real c1 SQL runs with an injected subtransaction failure, comparing columns/constraints/
indexes and all loan/payment/ledger/balance rows before retry; success preserves data
and both repayment paths. Outer rollback restores head schema and removes fixtures.
This is not a separate full-base replay; complete-chain startup/reset is a distinct CI
gate. Valid business shape/equality/currency checks now retain the shape constraint.
Qualification pending; prior scope/policy blockers above are historical, resolved only
by the explicit coordinated approval and its separate bounded scopes.
