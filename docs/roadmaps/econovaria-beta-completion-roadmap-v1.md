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
  - Status: `IMPLEMENTED_NOT_MERGED`
  - Owner branch: `fix/login-logo-sizing-v1`
  - Pull request: not opened.
  - Implementation commit: `35d91cbb80a4579fa01b2a758373295710a655d6`.
  - Dependencies: `BETA-BRAND-LOGIN-003`, merged by PR #411.
  - Beta impact: visual branding only; no feature semantics, authentication, API, database, asset, or production-deployment change.
  - Implementation files: `index.html` and `scripts/login-surface-browser-smoke.mjs`.
  - Migrations, routes, and RPCs: none.
  - Validation: `npm run audit:assets`; JavaScript syntax check; whitespace validation; computed responsive crop confirms approximately 262×204 px of visible artwork inside a 312×212 px header window.
  - Staging/runtime evidence: pending CI browser validation; production is unchanged.
  - Unresolved blocker: local Playwright could not install Chromium because the restricted download returned an invalid zero-byte archive; the unchanged CI browser environment remains required before merge.
  - Next exact roadmap item: publish the branch, open its pull request, and require the browser and repository checks before merge.
