# Immutable release promotion and rollback runbook

## Purpose

This runbook promotes one artifact set built from one commit already reachable
from `main`. Staging and production consume the same GitHub Actions workflow run,
artifact ID, release manifest, archive bytes, configuration snapshot, and
`artifactSetSha256`. Promotion never invokes the release builder.

Repository tooling does not prove an isolated staging deployment. Do not claim
`OPS-STAGE-006`, `OPS-STAGE-007`, `OPS-ARTIFACT-001`, `OPS-ARTIFACT-002`,
`BETA-PLAYER-010`, or `BETA-ADMIN-007` complete until the required connected
evidence exists and Chat 1 reconciles the authoritative roadmap.

## One-time environment setup

Create three GitHub environments named exactly `development`, `staging`, and
`production`.

For `staging` and `production`:

- configure a named required reviewer;
- prevent self-approval where the repository plan supports it;
- restrict deployment branches to `main`;
- configure environment-scoped secrets separately;
- never reuse a Supabase project ref, service-role key, access token, frontend
  target, or deploy token between environments;
- keep secret values only in GitHub Environments or the approved secret manager;
- record only secret names in repository evidence.

The required secret-name contract is:

- `FRONTEND_DEPLOY_TOKEN`;
- `SUPABASE_ACCESS_TOKEN`;
- `SUPABASE_ANON_KEY`;
- `SUPABASE_PROJECT_REF`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `SUPABASE_URL`.

Populate a real environment manifest from the matching template under
`docs/operations/environments/`, remove every placeholder, and commit the
reviewed non-sensitive record under `docs/operations/evidence/`. The manifest
must identify a distinct Supabase project and a distinct frontend deployment
target.

## Build once

1. Merge the bounded release candidate into `main` after required checks pass.
2. Dispatch `Release Artifact Build` with the full selected commit and the
   versioned release configuration path.
3. The workflow verifies the commit is reachable from `origin/main` and checks
   out that exact commit.
4. `release:validate-neutrality` rejects the build if Player/Admin static source
   contains an absolute Supabase origin, an absolute Cloudflare Worker origin,
   the audited live Supabase project ref, or the audited live Worker origin.
   Runtime endpoints must be supplied without mutating the immutable frontend
   archive.
5. After the neutrality gate passes, the workflow builds deterministic `tar.gz`
   archives and generates:
   - `release-manifest.json`;
   - `release-configuration.json`;
   - `checksums.sha256`;
   - one frontend archive;
   - one archive per deployable Edge Function;
   - GitHub artifact and provenance records.
6. Record the workflow run ID, immutable artifact ID, artifact digest,
   `releaseId`, commit, release-manifest digest, configuration version/digest,
   and `artifactSetSha256`.
7. Do not rerun the builder to replace an existing release. A correction requires
   a new commit and a new release ID.

## Staging promotion

1. Apply repository migrations to the isolated staging project through the
   approved migration workflow. Never use dashboard SQL as the normal path.
2. Capture the applied migration ledger, clean replay, schema comparison,
   environment identity, route inventory, legacy-runtime disposition, and
   rollback/restore evidence required by `staging-readiness-preflight.md`.
3. Create a staging promotion record using
   `docs/operations/promotion-record.template.json`.
4. Dispatch `Release Promote Exact Artifacts` with:
   - the original build workflow run ID;
   - the original artifact ID;
   - the release commit;
   - target `staging`;
   - the staging environment manifest evidence path;
   - the staging promotion record path.
5. The protected `staging` environment approval occurs before the artifact is
   authorized. The workflow downloads by artifact ID, verifies all hashes,
   validates migration/config/feature-flag identity, validates rollback evidence,
   and seals an approved staging package without rebuilding.
6. The approved environment-specific deployment adapter must deploy the sealed
   frontend and Edge Function bytes. Until that adapter and its isolated target
   exist, the workflow is authorization evidence only, not deployment evidence.
7. Record deployed function versions, frontend release SHA, deployment time,
   operator, target identities, build workflow run ID, artifact ID,
   release-manifest digest, configuration digest, and artifact-set digest.
8. Run connected desktop/mobile Player bootstrap and Admin smoke. Record pass/fail
   output without credentials, tokens, student data, ownership UUIDs, or raw
   sensitive payloads.

## Production promotion

Production promotion is prohibited unless the same workflow run, artifact ID,
`releaseId`, release-manifest digest, `artifactSetSha256`, and configuration
digest have passing staging Player and Admin evidence.

1. Create a production promotion record using
   `docs/operations/production-promotion-record.template.json`. Reference the
   connected staging evidence and a previous immutable production release as the
   rollback target.
2. Dispatch `Release Promote Exact Artifacts` using the same build workflow run
   ID and artifact ID used for staging, with target `production`.
3. Obtain the protected production approval and maintenance-window authorization.
4. Deploy through the approved production adapters without rebuilding, editing
   source in a dashboard, replacing configuration, or substituting an artifact.
5. Verify visible frontend release SHA, Edge Function versions, migration head,
   configuration version, feature flags, critical Player/Admin journeys, logs,
   and health checks.
6. Keep the rollback owner present for the approved observation window.
7. Commit a non-sensitive production promotion record and evidence digests.

## Rollback

Rollback is a promotion of a previously built immutable release, not a rebuild.

1. Identify the prior known-good build workflow run ID, artifact ID, release
   manifest, commit, configuration digest, and `artifactSetSha256`.
2. Confirm the prior release has valid staging evidence and is compatible with
   the current forward-only database state. If schema compatibility is uncertain,
   stop and use an approved forward correction instead of reverting migrations.
3. Create a promotion record whose promoted release is the prior artifact and
   whose rollback target is the currently deployed release.
4. Dispatch `Release Promote Exact Artifacts` for the affected protected
   environment using the prior artifact ID.
5. Verify checksums, visible release SHA, function versions, configuration,
   critical journeys, and recovery timing.
6. Record trigger, approver, operator, start/end time, result, observed RTO, and
   post-rollback status.

## Fail-closed conditions

Stop the release when any of the following is true:

- the selected commit is not a full SHA reachable from `main`;
- frontend source is bound to an audited live or absolute backend origin;
- an environment identity is missing, shared, or still a placeholder;
- a secret value appears in a manifest, evidence file, issue, log, or artifact;
- an artifact is missing or its digest/size differs from the release manifest;
- the Edge Function inventory differs from the checked-in repository;
- migration head, count, or version-set digest differs;
- configuration version, configuration digest, or feature flags differ;
- production lacks same-run, same-artifact, same-manifest, same-configuration
  staging Player/Admin evidence;
- approval, rollback target, restore evidence, or legacy-runtime containment is
  incomplete;
- the deployment adapter would rebuild, mutate, or substitute source files.
