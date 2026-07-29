# Econovaria Complete Development Roadmap

**Document ID:** `ECON-BETA-ROADMAP-V1`  
**Roadmap authority:** Chat 1  
**Audited main:** `ebe62a64d6cd4234f7b2792020b519a6a15ff39e`
**Audit date:** 2026-07-29
**Current decision:** `BLOCKED`  
**Production deployment authorized:** No

The detailed stable capability definitions and acceptance criteria in the prior roadmap revision remain authoritative unless changed by the live controller records below. Current status, ownership, merge order, migration collision decisions, and exact next actions are governed by:

- `docs/roadmaps/econovaria-beta-live-reconciliation-v3.md`;
- `docs/operations/econovaria-beta-coordination-matrix-v1.md`;
- `docs/operations/econovaria-beta-controller-reconciliation-2026-07-21.md`.

Use only `VERIFIED_COMPLETE`, `IMPLEMENTED_NOT_MERGED`, `IN_PROGRESS`, `PLANNED`, `BLOCKED`, and `RE_AUDIT_REQUIRED`.

PR #296 is closed without merge. PR #298 is the preceding merged controller authority. PRs #248, #249, and #261 are explicitly reactivated. PRs #299 and #300 are active authorities.

The mandatory queue is #163, #294, #299, #300, #249, #248, #261, shared convergence, #295, continuous pilot, and final go/no-go. Production promotion requires a separate explicit product-owner instruction.

## Scope Intake

- **`BETA-PROD-ADMIN-LOGIN-004` — Production Admin login trusted-header reconciliation**
  - Status: `VERIFIED_COMPLETE`
  - Repair pull request: PR #412, merged as `9350e5a8e3716779561db6432f8c11e345fa65c9`.
  - Regression-guard pull request: PR #414, merged as `2785cbf8`.
  - Root cause: production `web-session-api` version 15 returned `503 staff_login_unavailable` before emitting its first PostgREST or Auth request. Dependency-isolation run `30444485873` proved direct Auth and all three login-throttle RPCs were healthy. The remaining fail-closed boundary was the configured `x-real-ip` metadata, which was unavailable after the Supabase gateway hop.
  - Production repair: protected run `30446280999` verified the same `cf-connecting-ip` binding on staging, applied it to production project `cgiukdjwicykrmtkhudh`, preserved the healthy function, and made no database, application-data, Edge Function, or cryptographic-secret change.
  - End-to-end evidence: rerun attempt 2 of diagnostic run `30443924751`, job `90559844451`, traversed the production Vercel route with a synthetic nonexistent account and returned exact `401 invalid_staff_credentials`; no valid credential was supplied and no production mutation was performed by the diagnostic.
  - Regression prevention: the production web-session provisioning workflow and its repository contract now require `cf-connecting-ip`, preventing a later manual provisioning run from restoring the broken `x-real-ip` binding.
  - Unresolved blocker: none for the trusted-header boundary. The subsequent real-account authorization failure is owned separately by `BETA-PROD-ADMIN-LOGIN-005`.
  - Next exact roadmap item: `BETA-PROD-ADMIN-LOGIN-005`.

- **`BETA-PROD-ADMIN-LOGIN-005` — Production Admin login schema and metadata convergence**
  - Status: `IN_PROGRESS`
  - Current owner branch: `agent/production-admin-bootstrap-schema-trigger-cleanup-v1`; the schema repair was owned by `agent/production-admin-bootstrap-schema-reconcile-v1`, and the preceding Staff repair was owned by `agent/production-admin-staff-security-reconcile-v1`.
  - Production fault chain: a real administrator password reached Supabase Auth successfully, but the deployed login handler masked missing authorization and bootstrap projections as credential failures.
  - Staff root cause and repair: production `public.staff_users` had only the legacy six columns, and the linked Auth identity lacked the matching controlled `app_metadata`. PR #415 added the protected reconciliation plane; protected run `30450963053` then applied `20260726091000_add_staff_security_state_v2`, reconciled controlled Auth metadata, and proved all Staff schema, metadata, ledger, and PostgREST postconditions. PR #418 restored that workflow to manual-only after the one-time trigger.
  - Bootstrap root cause: after Staff authorization became healthy, the deployed handler's next projection required `public.game_sessions.game_join_code`, but production had only the other six bootstrap columns. Applying the older memorable-code migration wholesale was unsafe because it also defines game-creation functions whose prerequisites are absent in production.
  - Forward repair: PR #419 merged as `ebe62a64d6cd4234f7b2792020b519a6a15ff39e`. `backend/supabase/migrations/20260729123000_reconcile_admin_bootstrap_join_code_v1.sql` adds only the nullable `game_join_code` column, its format constraint, its partial unique index, and its comment. Protected run `30454172663` applied that exact migration and passed every authorization, precondition, atomic ledger, direct SQL, and PostgREST postcondition.
  - Authorization manifest: `docs/operations/evidence/production-admin-bootstrap-schema-reconciliation-v1.json`.
  - Safety boundary: exact merged-main SHA, exact production project binding, staging denial, production environment protection, aggregate-only evidence, no application-row writes or backfill, no database-function writes, no Auth metadata writes, no Edge deployment, no secret rotation, and no destructive rollback.
  - Runtime evidence: all 48 exact-head repository checks passed. Independent production SQL verification found all seven bootstrap columns, the nullable text column, validated constraint, valid unique index, zero invalid codes, one exact ledger row, one bootstrap projection row, all eight Staff security columns, one active Game Admin, zero missing Auth links, and zero metadata mismatches.
  - Trigger cleanup: `agent/production-admin-bootstrap-schema-trigger-cleanup-v1` restores `.github/workflows/production-admin-bootstrap-schema-reconcile.yml` to protected manual-only dispatch after the single successful push run.
  - Unresolved blocker: one successful real administrator login.
  - Next exact roadmap item: complete one real administrator login; if it succeeds, mark `BETA-PROD-ADMIN-LOGIN-005` `VERIFIED_COMPLETE`.

- **`BETA-BRAND-LOGIN-003` — Product-owner login logo replacement**
  - Status: `VERIFIED_COMPLETE`
  - Owner branch: `fix/login-logo-replacement-v2`
  - Pull request: #411, merged 2026-07-29.
  - Implementation commit: `fb452e5979e28c9ae35eedb0616ab6c68374ccda`.
  - Merge commit: `e13de3aff98e17730892d7e3550eaffe911b78e1`.
  - Dependencies: existing asset-backed login wiring merged by PR #400.
  - Beta impact: visual branding only; no feature semantics, authentication, API, database, or production-deployment change.
  - Implementation files: `assets/brand/Econovaria Logo.png`, `index.html`, `frontend/src/core/constants.js`, and `scripts/login-surface-browser-smoke.mjs`.
  - Migrations, routes, and RPCs: none.
  - Validation: exact supplied-file SHA-256 `f19b3ae263d2183b6b208d464996ec5f3f94bb6f2471b66b39557d19a8413726`; 2048×1149 TrueColorAlpha PNG with transparent pixels; `npm run audit:assets`; JavaScript syntax checks; HTTP `image/png` response and byte-identity check; cache-key consistency at `20260729.4`.
  - Staging/runtime evidence: all 12 required repository workflows and the Vercel preview passed before merge; production deployment was not part of this visual-only change.
  - Unresolved blocker: none.
  - Next exact roadmap item: `BETA-BRAND-LOGIN-004`.

- **`BETA-BRAND-LOGIN-004` — Enlarge the login logo treatment**
  - Status: `VERIFIED_COMPLETE`
  - Owner branch: `fix/login-logo-sizing-v1`
  - Pull request: #413, merged 2026-07-29.
  - Implementation commit: `35d91cbb80a4579fa01b2a758373295710a655d6`.
  - Merge commit: `7bc72758162bf5a9b955fb93c40fecf096da6674`.
  - Dependencies: `BETA-BRAND-LOGIN-003`, merged by PR #411.
  - Beta impact: visual branding only; no feature semantics, authentication, API, database, asset, or production-deployment change.
  - Implementation files: `index.html` and `scripts/login-surface-browser-smoke.mjs`.
  - Migrations, routes, and RPCs: none.
  - Validation: `npm run audit:assets`; JavaScript syntax check; whitespace validation; computed responsive crop confirms approximately 262×204 px of visible artwork inside a 312×212 px header window.
  - Staging/runtime evidence: merged after required repository and browser checks; production asset wiring remains unchanged.
  - Unresolved blocker: none.
  - Next exact roadmap item: `BETA-BRAND-LOGIN-005`.

- **`BETA-BRAND-LOGIN-005` — Reduce the enlarged login logo treatment**
  - Status: `IMPLEMENTED_NOT_MERGED`
  - Owner branch: `fix/login-logo-sizing-v2`
  - Pull request: not opened.
  - Implementation commit: `cf55c507dde7a016cc502d6992ad03a030dc24b2`.
  - Dependencies: `BETA-BRAND-LOGIN-004`, merged by PR #413.
  - Beta impact: visual branding only; no feature semantics, authentication, API, database, asset, favicon, or production-deployment change.
  - Implementation files: `index.html` and `scripts/login-surface-browser-smoke.mjs`.
  - Migrations, routes, and RPCs: none.
  - Validation: `npm run audit:assets`; JavaScript syntax check; whitespace validation; 400×224.41 px computed rendered image inside the unchanged 312×212 px header window, with approximately 210×163 px of visible artwork.
  - Staging/runtime evidence: pending CI browser validation; production is unchanged.
  - Unresolved blocker: none.
  - Next exact roadmap item: publish the branch, open its pull request, and require the browser and repository checks before merge.
