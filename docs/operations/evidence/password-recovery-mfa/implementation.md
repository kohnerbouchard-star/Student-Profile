# Staff password recovery MFA repair

Status: IMPLEMENTED_NOT_MERGED; [draft PR #862](https://github.com/kohnerbouchard-star/Student-Profile/pull/862), initial implementation `4faa2a70fac6ffd1bda857b7ab9d7e2a3a0a6f77`; parent review only. Owner authorization: 2026-10-05 09:18:52 UTC, bounded code repair, synthetic tests and draft PR. Base main `d7669d39f60cbfbf80b79ce05856e315cf60d9aa`; branch `fix/password-recovery-mfa`. Supports U4 without releasing REF-019/020 pauses.

Scope: `api/password-reset.js`, `auth/reset-password.{js,html,css}`, `scripts/vercel-auth-proxy-contract.test.mjs`, `scripts/password-recovery-mfa-browser.test.mjs`, `.github/workflows/auth-browser-review-contract.yml`, the parent-approved PR #862 authority manifest, this evidence and the beta roadmap intake. The authority verifier/regression paths are unchanged locks only. No Edge/database/dependency/runtime-config changes. #736/#668 have no implementation overlap; #735/#668 share only the additive roadmap entry. #620 owns workflow action-version upgrades: this patch leaves those pins unchanged and only registers this recovery test and its paths.

The existing password update first enforces Staff MFA. On `staff_mfa_required`, the UI clears password inputs, obtains verified TOTP handles via the existing Staff MFA service, and verifies a user-entered code. The new same-origin proxy operations require explicit project, bounded fields, bearer, Origin and trusted IP; provider/Staff/session/role/rate-limit and user-bound factor-handle checks remain authoritative. No enrollment or unenrollment operation is exposed. Only the elevated access token returns to browser memory; refresh tokens and upstream private fields are discarded. Password reset then requires a new explicit user submission through the unchanged endpoint and revocation/security-transition sequence.

Missing/inaccessible factors stop with administrator recovery guidance. Independent review reproduced a P2 stranded form on factor-status transport failure; the corrected flow clears recovery state with explicit fresh-email/admin guidance, and its new offline Chromium regression passes. Independent re-review found no further concrete issue. Expired sessions clear the bearer; invalid codes can be corrected. Leaving the page clears bearer and inputs and prevents a late response from restoring state. Non-MFA reset remains unchanged; MFA verification requires the existing hosted `/api/password-reset` transport, with no direct-Edge fallback or new cross-origin exposure.

Validation: Node 22.23.1/npm 10.9.8; pinned root/backend installs; full root `npm test` PASS; 29 focused auth contracts PASS; disposable Chromium recovery journey PASS using the system Chromium because the pinned browser download was network-blocked. Synthetic provider responses cover valid/invalid code, expired or wrong-project denial, missing/inaccessible factors, no token storage/refresh disclosure, no automatic password resubmit, page exit and elevated reset handoff. CI installs pinned Playwright Chromium and runs the same test. Backend full typecheck is blocked locally by the network tunnel denying the pinned esm.sh dependency; Node TypeScript stages passed. Backend smoke likewise reaches the unchanged Admin API dependency and is blocked by that tunnel denial after its earlier suites pass; neither full backend gate is claimed passed locally. These results do not establish live provider acceptance or a user's factor access.

Rollout: parent review and required exact-head CI precede any merge. No automatic merge/deployment. Staging qualification requires a separately approved reviewed frontend/proxy deployment to the exact approved staging preview, with staging runtime/project and recovery link bindings verified; this patch requires no Edge deployment or secret/factor change. Then separately authorize a private staging recovery/MFA/reset test and verify session revocation; never reuse tokens exposed in chat. The shared www production surface remains separately gated and is not a staging target. Lost-factor replacement and session safety remain separate controlled operations. Production promotion remains blocked. Rollback the frontend/proxy together to the prior reviewed commit, preserving all MFA checks and settings.

## Guarded-main reconciliation (2026-10-06)

Parent authorized reconciliation and draft qualification against main
`2661dd7399ee9877e4af236d3c77a5f3cc8780d7`. The only merge conflict was the
additive Scope Intake entry; both entries are retained and the merged guard
status is reconciled from its exact-main evidence. Recovery implementation,
proxy/browser tests and workflow are byte-identical to prior head
`422c8dbeb5b20111739778a2ce1a17f7842f7c74`. Main's release guard is retained
unchanged; no other automatic Auth writer is edited. New exact-head checks and
independent review are required before parent handoff. PR863 remains dependent.
No merge to main, dispatch, live account/factor/credential/settings change or
production authorization; REF-019/020 and all existing release holds remain.
