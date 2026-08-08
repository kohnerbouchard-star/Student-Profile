# Admin UI V2 Settings evidence

Branch: `refactor/admin-ui-v2-settings-v1`
Base: `4c17b942fcf4b2a6f60b629549f192d066053ba4`
Draft PR: `#511`

This directory is the evidence root for the Settings migration. Do not record a check as passed unless it was actually executed against this branch/head.

## Continuation reconciliation — 2026-08-07

The continuation pass fetched the latest `main` and confirmed it is still `4c17b942fcf4b2a6f60b629549f192d066053ba4`. The Settings branch remained 7 commits ahead and 0 behind before this evidence-only update, so no source reconciliation, Backend change, schema change, route-disposition change, or contract rewrite was required.

The last source-bearing Settings head, `167ab06d819e4767ceb3a6e9d509e543c5c6d29b`, completed the following checks successfully:

- Admin V2 Settings Check run `31162888218`;
- Settings API/controller contracts: 7/7 passed;
- rendered Chromium Settings acceptance: 8/8 passed;
- `git diff --check origin/main...HEAD` passed;
- Admin Browser E2E run `31162888301` passed, including the rendered Create Game/Admin journey and secure Admin ledger mutation journey;
- Backend Typecheck, Button Action Coverage, Environment Neutral Browser, Staging Readiness Preflight, Runtime Interaction Wiring, Release Integrity, Supply Chain Security, Production Runtime Promotion Contract, and Release Promote Exact Artifacts passed.

The Settings browser acceptance covers current persisted values, successful edits, client validation, validation-summary focus, confirmation autofocus and Escape/opener restoration, stale-data lockout, safe failed-save presentation, `settings.manage` permission denial, responsive/mobile containment, long/Korean values, private-ID/secret exclusion, CSRF/idempotency/game-scope headers, and absence of browser bearer-token leakage.

Repository Quality, Admin Shell Smoke, and Admin Scroll Integrity continue to reproduce repository baseline failures outside the Settings-owned diff. They are not treated as Settings regressions.

Vercel's earlier exact-head status was blocked by the account build-rate limit. This evidence-only continuation push intentionally gives Git integration a fresh opportunity to generate a current Settings preview without modifying Settings runtime behavior.

## Required evidence set

- focused Settings API/controller contract output;
- JavaScript syntax checks for changed modules;
- route-registry assertion showing only Settings moved from legacy to V2;
- current-values and successful-edit capture;
- client validation capture;
- failed-save safe-error capture;
- stale-read/refresh capture;
- `settings.manage` denial capture;
- AAL2-required and CSRF/idempotency mutation behavior;
- keyboard order, validation-summary focus, confirmation-dialog focus trap/Escape/opener restoration;
- desktop and narrow/mobile viewport captures with no document horizontal overflow;
- long-value and Korean-text fixture coverage;
- DOM/private-data scan showing no UUID ownership IDs, tokens, secrets, environment values, SQL, or service-role material;
- Overview, Store, and Market V2 regression results;
- legacy Admin Settings regression if included in the review matrix;
- `git diff --check` and changed-file secret scan;
- draft PR/CI result links.

## Implementation audit notes

The source audit established that `GET /api/admin/games/:gameId/settings` is the authoritative Admin read projection and `PATCH /api/admin/games/:gameId/settings` is the protected authoritative mutation. The Backend settings mutation persists through `admin_update_game_settings_v1`. The current Admin security boundary owns `settings.manage`, AAL2/MFA for mutations, game scope, rate limiting, audit identity, and request replay protection; V2 does not duplicate or relax those checks.

Unsupported Admin password-reset/2FA actions and secret/environment editing are intentionally not present in this V2 route.
