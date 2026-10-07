# STAFF-RECOVERY-OPERATOR-001 — staging system recovery

Status: IN_PROGRESS; not deployed or approved for live execution.
Base: main at 8f5ca00814e4823caeb241b5880f2c1cf4fb4af1, the verified PR862 source merge; older dependent-base checkpoints below are historical.
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

No live factor deletion, session revocation, account/security metadata change, email send, credential/grant provisioning, deployment or merge is authorized. No production actions. All operator provider effects use disposable adapters in tests. The former automatic production writer in the recovery release workflow was removed by merged PR868 at guarded main `2661dd7399ee9877e4af236d3c77a5f3cc8780d7`; other Auth writers remain unchanged. REF-019/020 holds remain unchanged.

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

### Operator-store composition and CI checkpoint

The operator runner now has a concrete service-RPC persistence adapter for begin/read/advance. Its new service-only read RPC binds exact request/user/source/evidence and returns only phase/restriction/acquisition booleans, so reconciliation can inspect an expired attempt without direct private-table access. Initial begin now stores the approved expiry and rejects altered-expiry replay, extending the same binding already enforced for replacement attempts. No credential binding or live command was added.

Independent adapter review found no new security defect. A timestamp-format-only assertion was corrected to compare equivalent instants. Implementation `eacce71e9f853e2dc37ee9a6d95d1644aea7bfd3` passed exact-head Repository Quality, Backend Typecheck, Admin API Check, Auth Browser Review, Staging System Account Recovery and Database Replay (including full replay from zero twice). Final adapter-head CI must be qualified separately.

Final operator-store focused run passed 39 tests (19 script, 19 suffix, one disposable database suite); secret scan passed.

## Guarded-main stack reconciliation (2026-10-06)

Parent authorized reconciliation and synthetic/draft qualification only. PR862
now includes guarded main `2661dd7399ee9877e4af236d3c77a5f3cc8780d7`; this
branch merges that exact dependent base. The sole conflict was the generated
architecture inventory, rebuilt mechanically from combined source. Oversized
source count remains 100; no ratchet or policy limit changes. Relative to prior
PR863 head `a94796e3150b1be37b685c15d8cc33eac9367e42`, recovery implementation,
migration bytes, tests and live-execution rejection remain unchanged. New
exact-head qualification and independent review precede parent handoff. No
merge to main, dispatch, live bindings, account/reset/factor/credential/settings
operation or production authorization. REF-019/020 and all existing holds remain.

## Current-main reconciliation after PR869

Parent authorized conflict-free normal integration of main
`853b225dd684a50c710a65f3d4afdd006df6ec71` through dependent PR862
`28e745554fcf28affe209dfeda43f6e2f4e3a1e1`. Only the five merged REF025
test/evidence paths and PR862 scoped evidence are imported. Recovery source,
migration, tests, authority, generated inventory and workflow bytes remain
unchanged from qualified head `f62ff785178ef0be2097c0b05f631bc4ed12476a`.
Fresh exact-head CI and independent source/merge-trigger review are required.
No live bindings, merge to main, dispatch or account/settings operation; all holds remain.

## Ownership handoff and PR872 stack reconciliation (2026-10-07)

The user transferred ownership for reconciliation and qualification of these
existing branches only. Prior PR863 head `e4c85e98beb79b71385bacffab8483f567afd921`
merges qualified PR862 `c6774c5138b9ccf972ca26468171417f9f43e0a0`, containing main
`96e8abd6d0cce7337985e09974f0fd2b7df4d8fb`. PR862 passed all 20 exact-head
workflows (41 successful checks, nine intended skips, successful Vercel status),
including full backend typecheck and smoke. Its local esm.sh tunnel limitation
remains accurately recorded and was not bypassed.

The sole conflict was adjacent recovery roadmap intake: preserve the operator
entry and the updated MFA entry. New edits only refresh this scope record and the
existing operator entry. Recovery source, migration, tests, generated inventory,
authority and recovery workflow bytes remain unchanged from prior PR863 head.
The original six suffix identities, registered seventh and all nine U1 holds
remain; inherited production-probe safeguards and backend qualification fixes
are retained. The older automatic-main-probe warning is superseded by merged
#871's guard; its separately authorized manual path remains unauthorized here.

Preserve #735/#736/#668/#620 ownership and the exact dependent PR base. External
system-admin authority remains separate from application roles; sole-operator
policy retains independent identity evidence and engineering review. No identity
provider is selected, purchased or composed. CLI remains plan-only, manual
recovery dispatch rejects, and live provider/session-revocation/key/recipient/
idempotency bindings remain unavailable. No merge, deployment, dispatch, live
account/credential/factor/settings operation or production authorization.
REF019/020 pauses, REF025 BLOCKED and REF027's 025+026 dependencies remain.

Reconciled-tree local qualification: pinned Node 22.23.1/npm 10.9.8/Deno 2.9.3,
clean root/backend installs and full root `npm test` PASS; 121 focused operator,
browser, disposable PostgreSQL, suffix, proxy/probe and U1-hold tests PASS with
zero skips; 28 network-denied Deno guard tests PASS. The database test uses its
existing digest-pinned PostgreSQL container with `--network none`, no hosted URL.
System Chromium was used locally; hosted tests retain pinned Playwright. Exact
authority accepts 25 changed paths under 27 locks; generated inventory is unchanged.
Full backend `typecheck:all` and `smoke` were attempted and BLOCKED locally by
the pinned esm.sh import tunnel; no source or gate workaround. Fresh hosted
exact-head qualification is required and will be recorded in the PR description.

## Approved main retarget after PR862 merge (2026-10-07)

User approved merging qualified PR862 and then retargeting/reconciling this PR,
without merging PR863 or deploying. PR862 merged as
`8f5ca00814e4823caeb241b5880f2c1cf4fb4af1`; tree
`3b3a536bb3986fb08d9e5029344a224cff1bf9b6` exactly matches qualified head
`c6774c5138b9ccf972ca26468171417f9f43e0a0`. All 13 merge-head workflows passed
on attempt 1 (22 passed checks, ten expected skips). Staging reconciliation,
production probing, live parity capture and production publication skipped.

Main merges normally into prior PR863 head
`bb40c0c80a4bfd615c14d898cf92ca6a284442be` with no conflict or content delta.
This tranche changes only PR863's existing authority `baseRef` to `main`, this
evidence and the two existing recovery roadmap entries. The same 25 changed
paths remain within 27 exact locks; no new path, check waiver or permission is
added. Recovery source, migration, tests, workflow, generated inventory, original
suffix identities and all nine U1 holds remain byte-identical to the prior head.

The new main base requires renewed local and exact-head hosted qualification;
prior 39-workflow results do not substitute for the retargeted head. Parent
review remains next; PR863 stays draft and unmerged. CLI remains plan-only and
manual recovery rejects. External system-admin/sole-operator policy, independent
identity evidence and engineering review remain. No live provider composition,
signup/purchase/credentials, deployment, recovery dispatch or production config.
REF019/020 pauses, REF025 BLOCKED and REF027's 025+026 dependencies remain.

Renewed local qualification of the main-bound tree: pinned Node 22.23.1/npm
10.9.8/Deno 2.9.3, clean root/backend installs, full root `npm test`, 137 focused
operator/browser/disposable-database/suffix/proxy/probe/U1/authority tests and
28 network-denied Deno guard tests PASS, zero focused skips. Authority accepts
25 changed paths under the same 27 locks with base `main`; inventory is unchanged.
Local Chromium uses the system executable; CI retains pinned Playwright. Full
backend typecheck and smoke were attempted and remain locally BLOCKED by the
pinned esm.sh import tunnel. Fresh hosted results must qualify the published
main-bound head and are recorded in the PR description. No checks were bypassed.
