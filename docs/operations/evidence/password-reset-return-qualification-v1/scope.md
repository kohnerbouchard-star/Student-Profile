# Password-reset return-type correction

Scope ID: AUDIT-PASSWORD-RESET-RETURN-001. Source baseline: `07dc68a8361570155a75ec965fe54bbe4d19377f`.

The existing Staff reset transition declares a bigint permission version while the authoritative column is integer. The forward migration changes only its returned value to `staff_users.permission_version::bigint`. Signature, other results, SECURITY DEFINER, search_path, grants, handler ordering, recovery protocol and all release holds are preserved. No historical migration, roadmap or lending implementation is changed.

## Qualification

The focused actual PostgreSQL test applies the original core, Staff state, real permission-grant triggers, original transition, onboarding and recovery migrations. It reproduces SQLSTATE `42804`, including integer versus bigint in column 3, then exercises the real corrected transition and recovery wrapper. All 11 TAP results pass. Permission version assertions capture post-trigger state; every fixture and assertion is synthetic and scoped to its own identifiers.

The new secret-free PR-only workflow runs this focused test and a separate full-schema test after a normal disposable Supabase reset. Full-schema acceptance attests exact checkout/container/ledger, checks the effective function body/signature/ACL and actual recovery delegation, then exercises service-role results, inactive/missing accounts, ordinary increments, privilege denial, rollback and stored recovery replay. It never replaces application routines or Auth schemas in the fully migrated database. Missing/unavailable database is a failure, not a skipped test. Full-schema execution is pending original CI; focused success does not certify it.

Local static/source checks pass: 17 CI/isolation guards, 8 existing password contracts, 21 suffix/forward-bundle tests, 28 offline Staff/recovery/MFA guards, migration source validation and immutable 435-migration baseline. Repository aggregate qualification is recorded separately in PR results. No live account, password, Auth provider, hosted database or production operation is exercised.

## Migration identity and integration

- Filename/version: `20261103082647_cast_staff_password_reset_permission_version_v2.sql` / `20261103082647`.
- Ninth suffix, `statementCount: 1`, raw SHA256 `27378476156232b0afa270f705195c4bc64613d874fb7f70301d3f06a882b708`.
- Normalized source SHA256 `cac8792d89e8de56effd83b0d6609d87ab6f7b0f57b898808c05d2bbbdb4ddb3`.
- Regression pins every original eight suffix identities; missing/extra/order/prefix/digest rejections and immutable bundles remain unchanged.
- Other unmerged suffix owners remain separate. They are neither imported nor exempted; later integration must reconcile the exact approved union independently.

Independent source review corrected a fixture assumption about permission-seeding triggers. The final tests capture actual post-trigger state without disabling triggers or changing grants. Final source review found no blocking issue; runtime qualification remains a separate gate.

## Merge and release gates

Keep draft pending exact-head original CI, full two-reset schema/catalog determinism and lint review, actual full-schema transition/recovery acceptance and independent review. Lint output must be assessed for new diagnostics; a successful process is not zero-finding certification. The original Database Replay workflow is unchanged. U1/live/release holds remain; merging source is not deployment authorization. No claim of live readiness or production resolution is made.
