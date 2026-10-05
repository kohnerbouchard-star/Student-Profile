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
- Parent approved systemRecovery.ts and systemRecovery.test.ts in the same directory for behavior-preserving extraction and concurrent handler tests.
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

No live operator adapter is bound. Fresh external operator authentication, approved provider session revocation, key/recipient/provider bindings and trusted restart for interrupted or expired attempts still require implementation and review. The workflow rejects manual execution. In particular, an ambiguous password-provider result must never be retried automatically: the account stays restricted pending trusted reconciliation. Delivery and notice worker functions now exist behind injected adapters; the CLI never constructs them or obtains credentials. Do not deploy these incomplete execution paths or claim operational recovery readiness.

### Extraction checkpoint

Parent approved `backend/supabase/functions/staff-mfa-api/systemRecovery.ts` and `systemRecovery.test.ts`. The handler and shared error class were extracted without changing its entrypoint authorization or signed-factor callbacks. Five handler tests now cover overlapping enrollment against an atomic reservation mock, interruption, backup assurance, slot ownership and response filtering. Independent review found no new blocker. The architecture ratchet returns to its unchanged baseline of 100 oversized sources.

CI on `24c5a013` passed the recovery workflow and actual Edge typecheck step. Backend/Admin test jobs exposed two test discriminant checks under their non-strict configuration; explicit boolean narrowing fixes those, with nine affected handler/guard tests passing under that exact configuration. New head CI is still required.

Database Replay on that head stops before database startup because `scripts/operations/live-migration-reconciliation/build-phase15-rehearsal-plan.mjs` does not register the new migration in `APPROVED_SUFFIXES`. The file governs both staging and production rehearsal plans. No approval list or immutable certificate was changed. Parent must approve the exact suffix registration path/change before that gate can be resolved; this is code/evidence registration, not authorization to run a live rehearsal or deploy. Operator implementation work remains outstanding as above.

### Delivery and reconciliation checkpoint

Implemented a private ciphertext delivery table and service-only RPC, plus injected Node delivery/store adapters. A one-shot reservation precedes provider token generation. AES-256-GCM uses a fresh 96-bit nonce and authenticated exact project/user/request/source/evidence/expiry binding. Retries reuse persisted material; ambiguous issuance stops. Sender idempotency is mandatory, and unknown outcomes remain unacknowledged. Lifecycle notices use durable outbox acknowledgements and contain no grant/password material. Explicit true is required for every storage mutation/readiness response.

Reconciliation implements only an external-operator-authorized read-only assessment. It identifies the phase and required evidence while preserving restriction; it never retries password updates, rotates grants, clears restrictions or starts another attempt. Safe restart requires independently proven quiescence of all previous executors/provider operations, which available live integrations cannot yet establish.

Independent review found and verified a fix for ignored/ambiguous storage return values; final review found no further blocker. Sixteen operator/delivery/notice/reconciliation tests, two Chromium journeys and the disposable database suite passed; all three local Edge boundary contracts passed, including negative mutations of the resolver import/call/rejection. Source-size ratchet remains 100 and secret scan passes. Prior checkpoint `e863724a` now has successful Backend Typecheck, Admin API Check and Auth Browser Review CI; newer-head checks remain required.

Parent approved suffix registration in `build-phase15-rehearsal-plan.mjs` and the equivalent stronger resolver contract in `local-edge-runtime-contract.test.mjs`. Registration changes metadata only; the `false &&` live-shaped-rehearsal hold, immutable certificates and execution logic remain unchanged. The suffix suite now passes 17/18 tests; its remaining failure is `phase15-forward-bundle.test.mjs:446` hardcoding six total suffixes. Updating that separate test to seven and pinning the new suffix requires parent path approval; no test was removed or relaxed.

Full repository `npm test` passed on implementation commit `b9848bf7165444d8d81b60ba0d83fb8491e47bcd`. This does not include the separately invoked Phase15 suffix suite, whose 17/18 result and exact scope gate remain above. No live operations were run.

### Bounded restart and suffix qualification

Parent approved the exact Phase15 test update. The original six suffix definitions were compared byte-for-byte against PR862 base before adding the seventh. Regression now pins a digest of all six original complete identities and the seventh migration's full identity/raw/source digests; all 19 suffix tests pass. No holds, certificates, existing-order assertions or execution logic changed.

Operator session revocation and factor removal now require one-shot durable acquisition (`revoking` / `removing`) before provider effects. Interrupted acquisitions cannot be retried or taken over. This closes the stale-worker race that independent review identified before allowing restart.

`system_recovery_restart_v1` and the injected `restartExpiredRecovery` function implement a bounded restart: fresh external approval binds both exact requests; only expired `ready` or `enrolling` attempts with no reserved/recorded factor or completion acquisition/receipt qualify. The transaction invalidates the old grant/ciphertext, records supersession/predecessor audit, and creates a new restricted attempt atomically. No visible unrestricted gap occurs. Replacement delivery and activation enforce the freshly approved expiry. Repeated restart is idempotent only while the exact replacement remains at its initial restricted phase.

Independent review confirmed the operator acquisition and expiry fixes. Eighteen script tests plus the disposable database suite pass, covering stale concurrent workers, approval binding, unsafe-phase denial, atomic rollback, old-grant denial, replay and expiry mismatch before issuance. Assessment-only reconciliation remains available for ambiguous phases; broad restart of an acquired provider operation is deliberately blocked until a real cancellation/quiescence protocol exists. Live integration/key/recipient/provider/idempotency bindings remain unavailable and execution remains disabled.
