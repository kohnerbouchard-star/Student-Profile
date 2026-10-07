# STAFF-RECOVERY-ENVIRONMENTS-002 — individual support recovery

Status: IN_PROGRESS. Source base: main
`1de01562af5b78a3407ca9bc8d7ee8935ca080f8` (merged PR863).
Owner: `feat/individual-mfa-recovery-environments`; draft [PR876](https://github.com/kohnerbouchard-star/Student-Profile/pull/876), no merge.

The owner approved source support for staging and production for one specific
support requester, after independent identity verification and exact account and
environment confirmation. The parent authorized successor planning and source
implementation with live execution disabled. This supersedes staging-only feature
scope, not the live gates in PR863. The earlier routing four-file budget does not
describe this separately authorized successor.

## Bounded implementation children

- A: versioned immutable request, sole external administrator approval, exact
  target adapter composition and focused synthetic tests (under 400 semantic lines).
- B: one forward migration, disposable database regression and exact suffix
  registration (under 400 semantic implementation lines; tests counted separately).
- C: existing proxy/browser/Staff environment guards and negative synthetic tests
  (under 400 semantic lines). Existing recovery state machine remains canonical.

Exact paths bound to PR876 before source implementation:

- `scripts/security/individual-account-recovery.mjs`
- `scripts/security/staging-account-recovery.mjs`
- `scripts/individual-account-recovery.test.mjs`
- `scripts/staging-account-recovery.test.mjs`
- `scripts/system-recovery-database.test.mjs`
- `backend/supabase/migrations/20261007221252_system_account_recovery_targets_v2.sql`
- `backend/src/platform/supabase/edgeStaffSession.ts`
- `backend/supabase/functions/admin-api/systemRecoveryGuard.test.ts`
- `backend/supabase/functions/staff-mfa-api/index.ts`
- `backend/supabase/functions/password-reset-api/index.ts`
- `api/password-reset.js`
- `auth/reset-password.js`
- `scripts/password-recovery-mfa-browser.test.mjs`
- `scripts/vercel-auth-proxy-contract.test.mjs`
- `.github/workflows/staging-account-recovery.yml` (synthetic registration only)
- `scripts/operations/live-migration-reconciliation/build-phase15-rehearsal-plan.mjs`
- `scripts/operations/live-migration-reconciliation/phase15-forward-bundle.test.mjs`
- `docs/architecture/inventories/econovaria-architecture-inventory-v2.json` (generated)
- this scope record and the additive global roadmap intake
- a new PR-specific exact-path authority; verifier/regression remain unchanged locks

Ownership census: #735 retains origin/release work; #736 Player runtime; #668
context/bootstrap/package work; #620 action pins. No implementation in those
paths is imported. Phase15 changes are suffix identity registration only; original
seven identities, certificates, execution logic and all existing U1 holds remain.
REF019/020 remain paused, REF025 remains BLOCKED and REF027 dependencies remain.

## Security and rollout

Explicit v2 environment/project/account/action/approved factors/support request,
evidence/source/request/expiry binding; no default, bulk selector, app-role approval
or global MFA disable. Fresh sole external administrator approval binds the whole
operation, including an explicit production confirmation. The database must bind
each deployment to one target and administrator; migration creates no binding.
Existing v1 operator RPCs must not bypass the new approval binding. Existing
restriction, session revocation, one-shot effects, recorded primary/backup
verification, private password transition, audit/outbox and fail-closed ambiguous
effect reconciliation remain mandatory. Cross-environment credentials and keys
must stay separate. Provider/identity choice is not an implementation shortcut.

Historical migration bytes are immutable. The CLI generated the new filename.
Migration must precede the expanded production restriction guard; rollout remains
unauthorized. Existing unresolved legacy attempts need explicit reconciliation,
not automatic conversion or restriction removal. Plan-only CLI and rejecting
manual workflow remain. No hosted migration, deployment, settings, origins,
credentials, provider purchase, dispatch, email, session or factor mutation.

Required evidence: exact scope verification, synthetic negative target/approval
matrix, isolated database replay/ACL/invariants, browser and proxy regressions,
root tests, backend typecheck/smoke, inventory and secret checks, independent
source review and fresh exact-head CI. No source or live readiness is claimed yet.
