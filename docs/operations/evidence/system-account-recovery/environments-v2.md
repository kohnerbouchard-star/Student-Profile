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

## Source implementation and qualification checkpoint

Implementation `28f9ef52c94acf7ebaa714745f7d74fda1cfb324` adds the versioned
request/approval contract, target-bound `system_recovery_operator_v2` wrapper and
existing-runtime production guards. The forward migration provisions no target
or administrator. It rejects unresolved restricted legacy attempts, retains all
historical migration bytes and removes service execution of six legacy operator
RPCs while keeping the existing user recovery state machine. Immutable operation
metadata and the projected five-field approval receipt remain private. Receipt
fields record the trusted verifier's decision; they do not independently prove
human authentication.

Independent review found and verified two corrections: v2 email idempotency now
binds project plus operation digest; approved browser links require exactly one
explicit supported project instead of using the ordinary reset fallback. The
same-request-ID shared-sender regression and missing/duplicate-project browser
cases pass. Final receipt minimization was separately reviewed with no new issue.

Local evidence uses Node22.23.1/npm10.9.8/Deno2.9.3 and clean root/backend installs.
49 operator/proxy/local-Edge tests, 21 suffix/disposable-database tests, three
Chromium journeys and 28 network-denied Deno guard tests pass, with zero skips.
The database runs in its digest-pinned network-isolated disposable container;
there is no hosted URL. Independent reviewer reran 32 operator tests and the
full disposable suite successfully. Root `npm test` passed on implementation
28f9ef52; post-review final-source rerun and exact-head hosted results belong in
the PR description. Secret and diff checks pass. Generated inventory retains
100 oversized sources. Exact authority currently accepts 20 changed paths under
23 locks; unused candidate paths are not edit permission beyond this capability.

Full backend typecheck/smoke were attempted locally and stopped at the pinned
esm.sh import tunnel. No dependency, assertion, permission or check workaround.
Hosted Backend Typecheck, Admin API and Database Replay/lint are mandatory.
Earlier-head CI is not substituted for the final review-fix head. Status remains
IN_PROGRESS pending qualification and parent review; no merge authorization.

## Remaining live decisions and rollout dependency

- Select and review the external sole-administrator identity/approval integration
  that proves fresh human authentication and independent support identity checks.
- Establish an approved account-specific provider revocation/verification method.
  Do not assume the documented JWT-based admin signOut is a user-ID-only API.
- Review separately bound staging/production service credentials, encryption keys,
  recipient resolution and sender with durable idempotency. None is discovered,
  created or selected here; target metadata is not credential-provenance proof.
- Review protected execution, exact-source approvals and separately provisioned
  database target/admin bindings. CLI remains plan-only and dispatch rejects.

Apply and verify the forward migration before expanded production guards; absent
RPCs fail closed and would deny Staff access. Migration refuses active legacy
attempts, which require their own reconciliation. Never roll back to a
staging-only restriction guard while a production attempt remains restricted;
a forward correction must preserve restriction and audit history. These are
rollout requirements, not authorization to deploy, migrate or execute recovery.
Next: exact-head qualification and parent review, followed only by independently
approved live integration/staging work. No production recovery is authorized.
