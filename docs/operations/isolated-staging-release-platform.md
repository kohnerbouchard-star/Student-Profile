# Isolated staging and immutable release platform

## Scope authority

Branch `agent/isolated-staging-release-v1` owns only the release-platform work for
`OPS-STAGE-006`, `OPS-STAGE-007`, `OPS-ARTIFACT-001`, and `OPS-ARTIFACT-002`, plus
the release infrastructure required to collect isolated-staging evidence for
`BETA-PLAYER-010` and `BETA-ADMIN-007`.

This tranche does not edit the authoritative roadmap, application behavior, seed
definitions, story delivery, database migrations, PR #163 files, or PR #244
files.

## Completion boundary

Repository tooling is not isolated-staging evidence. The release platform may be
merged when its workflow contracts, manifest validators, deterministic artifact
builder, promotion guard, rollback guard, environment templates, and runbooks
pass. The roadmap items remain incomplete until distinct environment identities,
protected approvals, actual staging deployment, connected Player/Admin smoke,
and rollback/restore evidence have been captured.

## Release invariants

1. Select one full commit SHA already reachable from `main`.
2. Build the static frontend and every deployable Edge Function exactly once.
3. Hash every artifact and generate one canonical release manifest.
4. Store the immutable artifact set in one GitHub Actions artifact; promotion
   downloads that artifact by ID and never rebuilds.
5. Use separate GitHub `staging` and `production` environments and separate
   environment-scoped secret names.
6. Require a complete promotion record, staging evidence for production, a
   previous immutable rollback target, and protected-environment approval.
7. Fail closed on missing evidence, placeholder identities, digest drift,
   source-commit mismatch, migration mismatch, or secret values.
8. Record promotion and rollback evidence without credentials or student data.

## Current external blocker

The audited live Supabase project is `cgiukdjwicykrmtkhudh` in organization
`EconovariaOrg`. It may not be reused as staging. A distinct synthetic-data-only
Supabase project and a distinct frontend deployment target are required before
connected staging evidence can exist. No resource is created and no live system
is changed by this tranche.
