# Isolated staging creation request — 2026-07-20

**Request status:** Awaiting explicit product-owner approval  
**Repository:** `kohnerbouchard-star/Student-Profile`  
**Release authority:** PR #280 / `agent/isolated-staging-release-v1`  
**Production deployment authorized:** No  
**Paid resource creation authorized:** No

This document is an approval request and execution specification. It is not
staging, deployment, rollback, restore, Player-smoke, or Admin-smoke evidence.
No resource may be created and no secret may be configured until the applicable
approval fields below are completed by the product owner.

## 1. Supabase staging project requested

Create exactly one new Supabase project dedicated to Econovaria staging.

| Field | Required value |
|---|---|
| Organization | `EconovariaOrg`, unless the owner explicitly approves another organization |
| Environment | `staging` |
| Region | `ap-northeast-2` preferred |
| Data policy | Synthetic-only; no production or student data |
| Project identity | New project ref distinct from development and the audited live project `cgiukdjwicykrmtkhudh` |
| Database | Separate database and migration ledger |
| Auth | Separate Auth users, configuration, sessions, keys, and redirect allow-list |
| Edge Functions | Separate deployments, versions, logs, and environment secrets |
| Storage | Separate or disabled according to the reviewed staging manifest |
| Backups | Separate staging backup identity; never treated as a production backup |
| Network/runtime | No implicit fallback to the audited live project or legacy Worker |

The staging project must not reuse a database, project ref, URL, publishable key,
service-role key, access token, Auth population, Edge Function version, log
stream, backup, or restore target from another environment.

## 2. Frontend staging target requested

Create exactly one static frontend deployment target dedicated to staging.
It must have:

- a distinct provider target/site identity;
- a staging-only deployment credential;
- HTTPS;
- a stable staging origin suitable for Auth redirect and CORS review;
- immutable deployment history or equivalent release traceability;
- no production custom-domain change;
- no build step during promotion—the target must consume the sealed frontend
  archive from the original release artifact set.

Provider and expected monthly cost must be recorded before creation. A paid
frontend target is not authorized by this request.

## 3. GitHub protected environments requested

Create GitHub environments named exactly:

- `staging`;
- `production`.

For both environments:

- restrict normal deployment to commits reachable from `main`;
- require a named reviewer;
- prevent self-approval where the repository plan supports it;
- preserve deployment history;
- use environment-scoped secrets rather than repository-wide release secrets.

Production must remain unusable for deployment until a separate explicit
production-change approval is recorded. Creating the `production` environment
is a control-plane action, not production deployment authorization.

## 4. Environment-scoped secret names

Configure values only in the approved GitHub environment or approved secret
manager. Repository records, PR text, workflow summaries, logs, and evidence
may contain names only.

Required names:

- `FRONTEND_DEPLOY_TOKEN`;
- `SUPABASE_ACCESS_TOKEN`;
- `SUPABASE_ANON_KEY`;
- `SUPABASE_PROJECT_REF`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `SUPABASE_URL`.

Staging and production values must be distinct. Service-role and access-token
values must never be exposed to frontend artifacts.

## 5. Application-neutrality prerequisite

The current application source is not promotable unchanged because static
browser files contain the audited live Supabase identity. Confirmed examples on
current `main` include:

- `frontend/src/core/constants.js`;
- `admin/index.html`;
- `player-terminal/host-runtime.js`;
- additional Admin/Auth browser adapters identified by the neutrality scan.

The application owner must externalize the endpoint and publishable-key runtime
configuration without changing accepted product behavior. PR #280 does not own
that feature-source correction. Until the correction merges and the complete
browser neutrality scan passes, `Release Artifact Build` must fail closed.

No active Cloudflare Worker origin was found in the current browser deployment
roots during this audit. Historical Worker references remain in audit documents
and verification scripts and are not runtime authorization.

## 6. Cost and approval decision

A new project may be created at no additional platform cost only if an unused
active Free-project slot is available and the owner approves using it. If the
organization or project requires a paid plan, stop before creation and provide
the exact current checkout price and monthly spend ceiling for explicit owner
approval.

Complete these decisions before any resource action:

| Decision | Required owner entry |
|---|---|
| Create synthetic-only Supabase staging project | `APPROVED` or `NOT APPROVED` |
| Use available Free project slot | `APPROVED`, `NOT AVAILABLE`, or `NOT APPROVED` |
| Paid-plan monthly spend ceiling, if required | Currency and exact amount, or `NOT APPROVED` |
| Preferred region `ap-northeast-2` | `APPROVED` or replacement region with rationale |
| Frontend staging provider and target | Provider, target identity, expected cost, approval |
| Staging GitHub required reviewer | GitHub user/team |
| Production GitHub required reviewer | GitHub user/team |
| Configure environment-scoped secrets | `APPROVED` or `NOT APPROVED` |
| Deploy to isolated staging after prerequisites pass | `APPROVED` or `NOT APPROVED` |
| Modify or deploy production | Separate approval required; currently `NOT AUTHORIZED` |

## 7. First immutable staging release procedure

After the resources and application-neutrality prerequisite are approved and
complete:

1. Select one full merge commit SHA already reachable from `main`.
2. Dispatch `Release Artifact Build` once for that SHA.
3. Retain the original workflow run ID and artifact ID.
4. Record the release-manifest SHA-256 and every artifact SHA-256 and size.
5. Record the repository migration head, migration count, and migration-version
   set digest.
6. Record the release configuration version, configuration SHA-256, and feature
   flags.
7. Apply repository migrations to the isolated staging project through the
   approved migration workflow.
8. Promote the original artifact set to the protected `staging` environment by
   run ID and artifact ID; do not rebuild or substitute configuration.
9. Deploy the sealed frontend and Edge Function archives through reviewed
   environment-specific adapters.
10. Capture deployed frontend identity, visible source SHA, Edge Function
    versions, environment identity, operator, approver, and timestamps.
11. Run connected Player desktop and mobile bootstrap smoke tests.
12. Run connected Admin smoke tests.
13. Promote a previous compatible immutable artifact back to staging and record
    rollback trigger, start/end timestamps, result, and observed recovery time.
14. Restore the selected staging release and rerun Player/Admin smoke before
    claiming release readiness.

## 8. Required immutable evidence package

The dated evidence package must contain or reference reviewed non-sensitive
records for:

- source commit SHA and proof it was merged into `main`;
- GitHub build workflow run ID and immutable artifact ID;
- release-manifest SHA-256;
- frontend and every Edge Function artifact SHA-256 and byte size;
- aggregate artifact-set SHA-256;
- migration head, count, and version-set SHA-256;
- applied staging migration ledger and schema-comparison result;
- configuration version, configuration SHA-256, and feature flags;
- staging Supabase project ref and frontend target identity;
- environment-neutrality result covering login, shared frontend, Admin, Player
  Terminal, and Auth roots;
- staging approver, operator, deployment timestamps, and function versions;
- connected Player desktop/mobile smoke result;
- connected Admin smoke result;
- rollback target release ID, artifact-set digest, rehearsal result, and observed
  recovery time;
- restore evidence supplied by the backup/restore workstream;
- confirmation that no credential, token, student data, internal ownership UUID,
  or sensitive response body appears in evidence.

`OPS-STAGE-006`, `OPS-STAGE-007`, `OPS-ARTIFACT-001`, `OPS-ARTIFACT-002`,
`BETA-PLAYER-010`, and `BETA-ADMIN-007` remain incomplete until this connected
evidence exists and the authoritative roadmap owner reconciles it.
