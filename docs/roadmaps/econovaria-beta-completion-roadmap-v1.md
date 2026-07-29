# Econovaria Complete Development Roadmap

**Document ID:** `ECON-BETA-ROADMAP-V1`  
**Roadmap authority:** Chat 1  
**Audited main:** `3a1b2a00785d4d0e755365e9f7a49c38c3110fb3`  
**Audit date:** 2026-07-21  
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
  - Status: `IN_PROGRESS`
  - Repair pull request: PR #412, merged as `9350e5a8e3716779561db6432f8c11e345fa65c9`.
  - Regression-guard branch: `agent/production-admin-login-regression-guard-v1`.
  - Root cause: production `web-session-api` version 15 returned `503 staff_login_unavailable` before emitting its first PostgREST or Auth request. Dependency-isolation run `30444485873` proved direct Auth and all three login-throttle RPCs were healthy. The remaining fail-closed boundary was the configured `x-real-ip` metadata, which was unavailable after the Supabase gateway hop.
  - Production repair: protected run `30446280999` verified the same `cf-connecting-ip` binding on staging, applied it to production project `cgiukdjwicykrmtkhudh`, preserved the healthy function, and made no database, application-data, Edge Function, or cryptographic-secret change.
  - End-to-end evidence: rerun attempt 2 of diagnostic run `30443924751`, job `90559844451`, traversed the production Vercel route with a synthetic nonexistent account and returned exact `401 invalid_staff_credentials`; no valid credential was supplied and no production mutation was performed by the diagnostic.
  - Regression prevention: the production web-session provisioning workflow and its repository contract now require `cf-connecting-ip`, preventing a later manual provisioning run from restoring the broken `x-real-ip` binding.
  - Unresolved blocker: one real administrator login remains required to close the incident; the production transport and credential-decision path are verified operational.
  - Next exact roadmap item: merge the regression guard, then complete one real administrator login and record the incident as `VERIFIED_COMPLETE`.

- **`BETA-BRAND-LOGIN-003` — Product-owner login logo replacement**
  - Status: `IMPLEMENTED_NOT_MERGED`
  - Owner branch: `fix/login-logo-replacement-v2`
  - Pull request: not opened.
  - Implementation commit: `688c07f1ce9665afbf1c337a7b2d5be02d12550d`.
  - Dependencies: existing asset-backed login wiring merged by PR #400.
  - Beta impact: visual branding only; no feature semantics, authentication, API, database, or production-deployment change.
  - Implementation files: `assets/brand/Econovaria Logo.png`, `index.html`, `frontend/src/core/constants.js`, and `scripts/login-surface-browser-smoke.mjs`.
  - Migrations, routes, and RPCs: none.
  - Validation: exact supplied-file SHA-256 `f19b3ae263d2183b6b208d464996ec5f3f94bb6f2471b66b39557d19a8413726`; 2048×1149 TrueColorAlpha PNG with transparent pixels; `npm run audit:assets`; JavaScript syntax checks; HTTP `image/png` response and byte-identity check; cache-key consistency at `20260729.4`.
  - Staging/runtime evidence: not yet required for this visual-only unmerged change; production is unchanged.
  - Unresolved blocker: the local Playwright smoke cannot launch because Chromium is not installed in this workspace; the unchanged CI browser smoke remains required before merge.
  - Next exact roadmap item: publish the branch, open its pull request, require the browser and repository checks, then merge only after all required checks pass.
