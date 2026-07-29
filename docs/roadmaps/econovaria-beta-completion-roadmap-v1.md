# Econovaria Complete Development Roadmap

**Document ID:** `ECON-BETA-ROADMAP-V1`  
**Roadmap authority:** Chat 1  
**Audited main:** `7bc72758162bf5a9b955fb93c40fecf096da6674`
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

- **`BETA-PROD-ADMIN-LOGIN-005` — Production Staff security schema and metadata convergence**
  - Status: `IN_PROGRESS`
  - Owner branch: `agent/production-admin-staff-security-reconcile-v1`.
  - Production fault: a real administrator password reached Supabase Auth successfully, but `web-session-api` still returned `401 invalid_staff_credentials` while loading the linked Staff authorization row.
  - Root cause: production `public.staff_users` contains only the legacy six columns. Deployed login code requires `status`, `role`, `permission_version`, `security_version`, and `mfa_required`; the linked Auth identity also lacks the matching controlled `app_metadata`. The missing PostgREST projection is incorrectly masked by the current handler as a credential failure.
  - Live evidence: the production Auth identity exists, is confirmed, has a password, is not banned or deleted, and has one linked Staff row. Staging has all eight canonical Staff security columns; production has none of them. Raw identifiers and credentials were not recorded.
  - Canonical migration: `backend/supabase/migrations/20260726091000_add_staff_security_state_v2.sql`, already merged in `main`, exact Git blob `9146d65204f7fcc045247ca5593f3e88e984ac36`.
  - Protected reconciliation: `.github/workflows/production-admin-staff-security-reconcile.yml` applies only the canonical additive migration, records its exact migration identity, reloads PostgREST, and runs `scripts/security/reconcile-staff-security-metadata.mjs` against controlled Auth `app_metadata`.
  - Authorization manifest: `docs/operations/evidence/production-admin-staff-security-reconciliation-v1.json`.
  - Safety boundary: exact merged-main SHA, exact production project binding, explicit typed confirmation, staging denial, production environment protection, locked operator dependencies, aggregate-only evidence, no application-row writes, no Edge deployment, no secret rotation, and no destructive rollback.
  - Runtime evidence: pending protected production reconciliation and one successful real administrator login.
  - Unresolved blocker: merge the protected reconciliation control plane and run it against production.
  - Next exact roadmap item: pass repository checks, merge the repair PR, dispatch the protected reconciliation from the resulting `main` SHA, verify all schema/metadata postconditions, and complete one real administrator login.

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
  - Next exact roadmap item: none.
