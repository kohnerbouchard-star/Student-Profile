# STAFF-RECOVERY-OPERATOR-001 — staging system recovery

Status: IN_PROGRESS; not deployed or approved for live execution.
Dependency: PR862 at 422c8dbeb5b20111739778a2ce1a17f7842f7c74.
Owner branch: feat/staging-system-account-recovery.
Dependent draft PR: https://github.com/kohnerbouchard-star/Student-Profile/pull/863. Implementation commit: b12c24fe993c498cce6569a5629c386b4de140c3.

The owner authorized code, disposable tests, independent review and a separate dependent draft PR on 2026-10-05. The parent approved two tranches: security state/operator, then user journey. This explicitly expands the former four-file/400-line routing repair; that budget is not represented as satisfied by this capability. Each tranche requires independent review. Existing PR862 authority is unchanged.

Recovery approval belongs to an external system operator, never game_admin or the application security_operator role. A proposed manually dispatched staging workflow remains non-executable until separately reviewed operator authentication, environment approval, credential bindings and live-operation authorization exist. Dispatch actor names and typed confirmations do not prove fresh operator authentication.

## Approved paths

- One CLI-generated forward migration and focused disposable database tests.
- scripts/security/staging-account-recovery.mjs and focused tests.
- .github/workflows/staging-account-recovery.yml.
- backend/src/platform/supabase/edgeStaffSession.ts.
- backend/supabase/functions/admin-api/adminSecurityGuard.ts and focused tests.
- backend/src/domains/auth/api/staffLoginHttpHandler.ts and focused tests.
- backend/supabase/functions/staff-mfa-api/index.ts and focused tests.
- backend/supabase/functions/password-reset-api/index.ts.
- backend/supabase/functions/web-session-api/index.ts.
- api/password-reset.js and focused proxy tests.
- auth/reset-password.html, auth/reset-password.js, auth/reset-password.css and synthetic browser tests.
- This evidence, a separate PR authority contract and roadmap scope entry.

The last two independent authorization entrypoints were approved by the parent after read-only review. Existing browser database ACLs must remain closed. No Player or production workflow changes.

## Security contract

Keep mfa_required=true. Restrict every Econovaria authorization path before destructive recovery operations. Require exact project, approved user/request/source, expiring single-use grant and a live bound Auth session. Only record factors created for that attempt; arbitrary provider AAL2 or factor counts never complete recovery. Record operator identity, identity-check evidence reference, state transitions and notification outcomes without secrets. Retrying, expiry, cancellation or a provider failure must not restore ordinary account access. After primary/backup verification and user-private password setting, complete the existing security transition and require fresh sign-in.

This guarantees application-access restriction, not restriction of Supabase's public Auth API. A browser-visible provider bearer may change provider credentials directly. Such changes must never remove Econovaria's recovery restriction or satisfy completion without the approved attempt and its recorded factors.

## Live gates

No live factor deletion, session revocation, account/security metadata change, email send, credential/grant provisioning, deployment or merge is authorized. No production actions. All operator provider effects use disposable adapters in tests. The existing production-mutating recovery release workflow remains a separate merge blocker. REF-019/020 holds remain unchanged.

## Local verification and review

Both implementation tranches are present, including the user-private primary/backup setup and password page. Independent recovery-boundary review identified concurrent provider effects; one-shot row-locked enrollment reservations and completion acquisition now prevent competing provider calls. Interrupted effects remain restricted, with terminal operator guidance and browser secret clearing. Re-review found no further defect in those fixes.

Local focused run passed 10 tests: seven operator-adapter contracts, two Chromium/proxy journeys, and one disposable PostgreSQL transaction suite. Four Deno guard suites passed 23 tests with network denied. These are synthetic tests, not live recovery evidence. Database tests cover repeated reservation/completion acquisition; concurrent Edge handler execution is not yet separately exercised. Full Edge typechecking is blocked locally by esm.sh tunnel access and must pass CI. Repository-wide npm test initially stopped on the expected regenerated architecture inventory; its generated diff is included as mechanical evidence.

## Remaining execution blockers

No live operator adapter is bound. Fresh external operator authentication, approved provider session revocation, encrypted durable grant delivery, audit/notification delivery and trusted reconciliation/restart for interrupted or expired attempts still require implementation and review. The workflow rejects manual execution. In particular, an ambiguous password-provider result must never be retried automatically: the account stays restricted pending trusted reconciliation. The private outbox records intent; it is not a delivery worker. Do not deploy these incomplete execution paths or claim operational recovery readiness.

Repository-wide rerun passed inventory consistency, then failed the architecture ratchet: oversizedSourceFiles=101 exceeds baseline 100 because staff-mfa-api/index.ts grew past its size limit. Do not raise the baseline or compress formatting. A reviewed extraction into a dedicated recovery module is needed; that new implementation path is outside the exact current allowlist. Full repository validation and exact-head CI are therefore not green.
