# Econovaria production-grade execution plan

**Program start:** 2026-07-17

**Pilot target:** 12–20 weeks with two focused engineers

**Mature platform target:** 6–12 months

**Strategy:** contain risk, restore one source of truth, then modernize by
capability without redesigning the accepted v606 experience.

## North-star launch gate

Econovaria is production-grade only when a reviewed commit can recreate a clean
environment, promote unchanged artifacts through staging, isolate every game
and identity, survive a documented restore, and be operated from measurable
service objectives without depending on unknown legacy paths.

## Phase 0 — containment and change authority (days 0–7)

**Deliverables**

- Freeze manual schema/function deploys except approved incident containment.
- Keep one checked-in production manifest and assign production, database,
  frontend, security, and incident owners.
- Inventory traffic and consumers for all legacy functions and the Worker.
- Rotate the embedded legacy master credential.
- Disable `make-server-0dbf686f` if unused; otherwise add deny-by-default staff
  authentication, target-game ownership, route allow-listing, and restricted
  CORS before more feature work.
- Approve a paid production plan, backup retention, and isolated staging design.

**Exit gate**

- No broad admin mutation is authorized only by a project JWT.
- Every deployed runtime has an owner, consumer, source hash, auth model,
  datastore, and disposition.
- Production changes have an approver and rollback record.

## Phase 1 — database and release truth (weeks 1–4)

**Already implemented in this branch**

- Removed the duplicate notification-table creation from the earlier storyline
  migration and made the July notification definition canonical.
- Added a forward hardening migration that makes notification delivery scope
  consistent with its game session.
- Added transaction checks, duplicate table/version checks, local Supabase
  configuration, and a CI job that replays the full chain twice and lints it.
- Added exact Node/npm/Deno/Supabase/Playwright pins, shared Edge dependency
  locking, complete stock-function typecheck coverage, CODEOWNERS, and PR gates.

**Still required**

1. Export the live schema, extensions, grants, policies, Auth configuration,
   function inventory, and exact applied migration ledger.
2. Restore the export into an isolated project and compare it with a clean
   repository replay.
3. Create a reviewed reconciliation ledger: local version, live version, name,
   checksum, schema effect, and disposition.
4. If needed, create a canonical baseline for new environments and archive the
   broken historic chain with provenance. Repair the live ledger only after a
   restored-copy rehearsal and independent review.
5. Add deterministic fixtures and pgTAP tests for schema contracts, grants,
   RLS, cross-game access, money invariants, and idempotency.
6. Establish development, staging, and production environments with separate
   secrets and no production data copied into lower environments.

**Exit gate**

- Clean reset passes twice and approved schema diff is empty.
- Repository/live migration mapping is one-to-one and reviewed.
- A no-op forward migration travels through staging and production using the
  release path, with rollback timing recorded.

## Phase 2 — secure release platform (weeks 3–7)

1. Build immutable frontend and Edge Function artifacts from merge commits.
2. Generate release manifests with artifact hashes, migration head, config
   schema, feature flags, and visible frontend release SHA.
3. Use protected staging and production environments with named approval.
4. Promote identical artifacts; prohibit dashboard source editing.
5. Add secret scanning, dependency review, SBOM/provenance, exact dependency
   update automation, and a monthly patch cadence.
6. Enable leaked-password protection; define staff MFA, recovery, SMTP, password
   strength, session revocation, and abuse controls.
7. Introduce CSP in report-only mode, then enforce it after moving inline code
   and unsafe HTML behind controlled boundaries. Add HSTS, Referrer-Policy,
   Permissions-Policy, frame restrictions, and content-type hardening at host.

**Exit gate**

- Preview → staging → production is reproducible and approval protected.
- Previous frontend/function artifacts can be restored inside the rollback
  objective, and database corrections use rehearsed forward migrations.

## Phase 3 — identity, authorization, and abuse resistance (weeks 4–9)

1. Build an authorization matrix for every modern route: unauthenticated, wrong
   role, inactive user, wrong game, wrong player, revoked/expired session, valid
   owner, and replayed idempotency key.
2. Centralize admin session refresh with rotation, expiry skew, cross-tab
   coordination, sign-out/revocation handling, and safe failure behavior; prefer
   an HttpOnly-cookie BFF if hosting permits.
3. Add shared rate limiting by IP, identity, game, and action. Return 429 plus
   `Retry-After`; preserve scanner burst behavior explicitly.
4. Generate strict database types. Move auth context, route parameters, money,
   settings, and database response maps to strict TypeScript first.
5. Add audit events for denials, rate-limit decisions, privileged mutations,
   role changes, settings changes, and access-code operations without logging
   credentials or student-sensitive bodies.

**Exit gate**

- Every service-role route proves target ownership in automated tests.
- Login/session flows withstand expiry, refresh rotation, revocation, replay,
  brute-force, and cross-game attempts.

## Phase 4 — one transport and legacy retirement (weeks 6–14)

1. Publish a capability registry naming the authoritative API/datastore for
   authentication, sessions, attendance, store, contracts, stocks, ratings,
   inventory, settings, and administration.
2. Add one typed versioned client with explicit middleware for auth, request ID,
   timeout, retry eligibility, errors, and telemetry.
3. Put the v606 bundle behind an anti-corruption facade. Migrate named methods
   instead of patching global `fetch`.
4. Move one capability at a time: read shadow/reconciliation, controlled cutover,
   rollback flag, observation window, then delete the old route. Never dual-write
   balances or inventory.
5. Ratchet the current eight `window.fetch` assignments and thirteen
   `MutationObserver` sites down on every extraction.
6. Retire the Worker and both legacy functions after traffic is zero for the
   agreed observation window and restore snapshots are preserved.

**Exit gate**

- One backend owns each capability; there are no silent fallback writes.
- Global fetch wrappers reach zero; observers remain only where DOM observation
  is the actual product requirement.

## Phase 5 — reliability, recovery, and pilot (weeks 8–20)

1. Define SLOs for classroom availability, login success, admin reads/writes,
   purchase/stock mutation latency, and data durability. Define error budgets.
2. Emit structured logs with release SHA, request ID, route template, safe
   pseudonymous actor/game identifiers, duration, DB time/count, result class,
   retry/idempotency outcome, and cold-start indicator.
3. Add dashboards and alerts for availability, p95 latency, auth failures,
   cross-scope denials, 429s, function errors, migration failures, and backup age.
4. Upgrade production backup posture. Encrypt an off-platform backup and restore
   it into isolation, including Auth/config/function/storage reconstruction.
5. Set and rehearse RPO/RTO, incident severity, on-call ownership, communication,
   classroom fallback, data correction, and post-incident review.
6. Add load fixtures, explain-plan review, the missing foreign-key indexes, and
   bounded query/response contracts. Remove unused indexes only from evidence.
7. Run a limited pilot with explicit class count, support hours, rollback rules,
   data retention/privacy terms, and daily health review.

**Exit gate**

- Restore and environment reconstruction meet the approved RPO/RTO.
- The pilot stays inside SLO/error budget with no unknown legacy traffic and no
  unresolved P0/P1 security or data-integrity finding.

## Phase 6 — sustainable architecture (months 4–12)

- Split admin routing by bounded context and separate transport, authorization,
  use case, repository, response mapping, and audit emission.
- Extract v606 panels one at a time under screenshot and contract parity tests.
- Introduce accessible design-system components/tokens without mixing a visual
  redesign into transport/security work.
- Add privacy classification, retention/deletion workflows, audit retention,
  export requirements, and third-party processor review for student data.
- Measure strict-type coverage, route complexity, bundle size, flaky tests,
  migration replay time, dependency age, legacy traffic, and recovery results.

## Weekly program scoreboard

| Metric | Starting point | Pilot target |
| --- | ---: | ---: |
| Unreconciled migration versions | 23 ledger-only/local-only identities | 0 |
| Active legacy backends | 3 runtime paths | 0 unknown; documented temporary adapters only |
| Admin global fetch assignments | 8 | 0 |
| Admin MutationObservers | 13 | declining; every remaining site justified |
| Edge functions omitted from typecheck | 5 stock functions | 0 |
| Clean database replays in CI | 0 | 2 per relevant change |
| Isolated pre-production environments | 0 | at least 1 staging environment |
| Tested restore exercises | 0 | 1 before pilot, then quarterly |
| Security Advisor warnings | 1 known warning | 0 accepted without owner/expiry |
| Production releases from unmerged code | current live state | 0 |

## Decisions requiring explicit owner approval

- Disabling/deleting any live function or Worker route
- Rotating credentials and coordinating affected consumers
- Changing the Supabase plan or creating paid environments
- Repairing live migration-history records
- Applying the new database hardening migration to live data
- Enabling auth/MFA/password policy changes that affect staff access
- Production deployment, restore, or rollback
