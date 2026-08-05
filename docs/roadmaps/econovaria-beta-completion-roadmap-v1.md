# Econovaria Complete Development Roadmap

**Document ID:** `ECON-BETA-ROADMAP-V1`  
**Roadmap authority:** Chat 1  
**Audited main:** `418788be4052844c8ecedd1953f370b5d3b4b03e`
**Audit date:** 2026-08-05
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

- **`BETA-PROD-ADMIN-WIRING-006` — Systemic Admin API local-handler correction**
  - Status: `IMPLEMENTED_NOT_MERGED`
  - Owner branch: `fix/admin-join-code-read-isolated`; implementation commit `d31c074b90b53fb81fc93b73afafcff8eb9df751` is published to the public origin in draft PR #496. No merge, deployment, database application, or production-infrastructure change was performed.
  - Exact base: `origin/main` was fetched at `418788be4052844c8ecedd1953f370b5d3b4b03e`; the owner branch remains one committed change ahead for the already-local, owner-scoped join-code read.
  - Scope: replace synchronous `admin-api` to `classroom-api` calls for Admin player creation, Store item create/update/delete, Contract create/draft/schedule/publish, manual and scanner attendance recording, game-settings updates, and join-code read/rotation with shared local application handlers.
  - Security boundary: preserve one browser-BFF CSRF/network evaluation and one Admin authentication, AAL2, permission, owner-scope, user-action rate-limit, and request/audit-identity evaluation; do not accept browser forwarding headers as an identity source or pass a generic service-role bearer credential between functions.
  - Persistence boundary: require stable payload-bound idempotency for every scoped mutation; replay the original result for the same key and payload, reject key reuse with a different payload, and keep critical mutation, audit, and idempotency completion in one database transaction.
  - Architecture implemented: the Admin security guard performs the single authentication, AAL2, CSRF, permission, owner-scope, user-action rate-limit, and request/audit identity evaluation before `localGameMutations.ts` invokes shared Player, attendance, Store, Contract, settings, and join-code application modules. The Classroom entrypoint now reuses the same modules. A proxy deny-list prevents every scoped operation, including join-code GET, from reaching `fetchClassroom`. Compatibility actions are bound to their exact URL resource and method so a body operation cannot cross the permission domain.
  - Pull request and implementation commit: draft PR #496; `d31c074b90b53fb81fc93b73afafcff8eb9df751`.
  - Implementation files: shared handlers under `backend/src/domains/{players,attendance,store,contracts,game-sessions}/application`; shared idempotency adapter `backend/src/platform/supabase/adminMutation.ts`; Admin dispatcher and compatibility boundary under `backend/supabase/functions/admin-api`; retained Classroom HTTP adapters under each domain `api` module; canonical BFF/web-session/local-gateway idempotency and trusted-IP handling; focused UI retry and response-projection corrections in the Admin terminal.
  - Migration: `20260805023228_admin_local_application_mutations_v1.sql` adds private, forced-RLS `admin_mutation_requests`, private begin/complete helpers, and service-role-only public RPCs `admin_read_mutation_replay_v1`, `admin_create_player_v1`, `admin_archive_player_v1`, `admin_mutate_store_item_v1`, `admin_mutate_contract_v1`, `admin_record_attendance_v1`, `admin_update_game_settings_v1`, and `admin_rotate_game_join_code_v1`. Each critical write, Staff audit entry, and idempotency completion occurs in one Postgres function transaction; no migration was applied to a database.
  - Remaining Admin-to-Classroom calls: Contract progress read; Player access-code reset; Contract submission decision/review; and Contract reward issue. They are distinct read/review/credential use cases outside this item, and the affected local-operation proxy guard rejects their use for this scope.
  - Validation: under repository-pinned Node `22.23.1`, npm `10.9.8`, Supabase CLI `2.109.1`, and the frozen Deno locks: `npm run test:admin-local-mutations` 76/76; `npm run test:admin-api` 139/139; `npm run test:game-sessions` 35/35; focused Classroom handler tests 34/34; `npm run test:admin-local-mutation-ui` 13/13; proxy/auth/gateway contracts 26/26; `npm run test:auth-boundaries` 16/16 plus 8/8; complete `npm --prefix backend run typecheck:all`; web-session Deno check; focused `deno lint` and `deno fmt --check`; migration and architecture audits; Admin game-session control smoke; changed-file credential scan; and `git diff --check` all pass.
  - Validation limitations: the Docker-backed local Supabase replay starts successfully but the existing migration chain stops at unchanged `20260721143000_harden_marketplace_legacy_projection_conflicts_v1.sql` with `MARKETPLACE_LEGACY_FUNCTION_BODY_UNRECOGNIZED:create_marketplace_listing_projection_legacy_v2`, before reaching this item's migration; database lint and the new RPC runtime replay therefore remain blocked. Repository-wide `npm test` stops on the unchanged stock-runner JWT configuration ratchet. Full backend smoke is additionally affected by a POSIX-only inline environment assignment on Windows and unchanged historical rate-limit, Inventory, Progression, Messaging, and economic-ledger migration text-contract failures. The affected Admin mutation, security-order, UI, typecheck, migration-static-contract, and architecture suites are green.
  - Product-contract decisions still required: secure server-generated one-time Player ID/Access Code delivery versus the established explicit-credential API; Store image storage, validation, access, and retention policy; representation of unlimited/country stock and persistence of UI-only item type/restock/fulfillment/usage fields; whether idempotency equality means the normalized business command or literal raw request bytes. Manual correction, Store archive, and publish-existing-draft backend routes are implemented but currently have no active v606 terminal controls.
  - Runtime evidence: the implementation is committed and published in draft PR #496, but it is not merged, deployed, or connected to staging; the item must not be marked `VERIFIED_COMPLETE`.
  - Next exact roadmap item: repair the pre-existing migration replay blocker, run database lint and runtime replay/conflict/rollback probes, obtain review for the product-contract decisions, and pass required PR CI before marking the draft ready; only after merge to `main` and authorized staging evidence may this item become `VERIFIED_COMPLETE`.

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
