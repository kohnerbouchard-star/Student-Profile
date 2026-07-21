# Isolated staging resource blocker — 2026-07-20

## Current audited production-adjacent identity

- Supabase organization: `EconovariaOrg`
- Existing audited project ref: `cgiukdjwicykrmtkhudh`
- Existing project region: `ap-northeast-2`
- Existing audited plan: Free

The existing project may not be reused as development or staging. Reusing it
would violate environment identity, secret isolation, synthetic-data-only, and
rollback-evidence requirements.

## Resource required for connected staging evidence

1. One new Supabase project dedicated to staging.
   - Organization: `EconovariaOrg`, unless the owner deliberately creates a
     separate staging organization and records that decision.
   - Region: `ap-northeast-2`, unless the owner approves a different region and
     its latency/data-residency implications.
   - Data policy: synthetic-only.
   - Required separation: project ref, database, Auth users, service-role key,
     public key, project access token, URLs, function versions, logs, and backups.
2. One separate static frontend staging target with its own provider identity and
   deploy credential.
3. Protected GitHub environments named `staging` and `production`, each with
   separate environment-scoped secrets. Production requires a named reviewer and
   no self-approval where supported.

## Application configuration blocker

The accepted static Admin source currently contains an absolute URL for the
audited live Supabase project. An artifact containing that binding cannot be used
as an isolated staging artifact and then promoted unchanged to production.

PR #280 adds `release:validate-neutrality`. The manual immutable-artifact workflow
fails before packaging whenever Player/Admin static source contains an absolute
Supabase origin, an absolute Cloudflare Worker origin, the audited live project
ref, or the audited live Worker origin. The application owner must externalize
runtime endpoint configuration or otherwise make the checked-in frontend
artifact environment-neutral. This release tranche does not modify application
source.

## Expected Supabase cost

Official Supabase pricing checked on 2026-07-20 states that the Free plan permits
two active projects. If the account still has an unused active Free project slot,
the isolated staging Supabase project can be created at an expected platform cost
of USD 0 per month, subject to Free-plan limits and inactivity pausing.

If a paid organization is required, Pro starts at USD 25 per month and each Micro
project consumes approximately USD 10 per month of compute, with USD 10 monthly
compute credit per paid organization. Two active Micro projects in one Pro
organization therefore have an expected base total of approximately USD 35 per
month. Three active Micro projects have an expected base total of approximately
USD 45 per month, before usage overages or add-ons.

The frontend staging target cost is provider-dependent and cannot be stated until
the deployment provider is selected. This tranche does not authorize a paid
frontend host, custom domain, IPv4 add-on, PITR, or other paid add-on.

## Explicit confirmation required

The product owner must confirm all of the following before resource creation:

- permission to create a new synthetic-only Supabase staging project;
- whether to use an available Free project slot or upgrade/create a Pro
  organization;
- approval of the monthly spend ceiling if a paid plan is required;
- approved frontend staging provider and target;
- named staging and production approvers;
- permission to configure environment-scoped secrets;
- separate explicit approval for any production deployment or modification.

## Work not blocked by cost

Repository schemas, validators, deterministic artifact generation, checksums,
provenance, exact-artifact promotion, rollback controls, environment templates,
runbooks, workflow-contract tests, and environment-neutrality enforcement are
implemented on PR #280. Real `OPS-STAGE-006`, `OPS-STAGE-007`,
`OPS-ARTIFACT-001`, `OPS-ARTIFACT-002`, `BETA-PLAYER-010`, and
`BETA-ADMIN-007` evidence remains unavailable until the application binding,
distinct resources, approvals, connected deployments, and recovery evidence are
resolved.
