# Econovaria operations

This directory is the repository source of truth for production identity,
change authority, recovery expectations, and the production-grade program.

- `production-manifest-2026-07-17.json` records the last read-only live audit.
- `production-change-control.md` defines normal and emergency change paths.
- `legacy-service-containment.md` defines the evidence and approvals needed to
  contain the legacy services safely.
- `branch-cleanup-2026-07-17.md` records the audited GitHub branch-retention
  decision and safe cleanup boundary.
- `github-repository-settings.md` defines the main-branch ruleset, required
  checks, security settings, and protected release environments.
- `staging-readiness-preflight.md` defines the deterministic fail-closed gate
  for isolated staging evidence and recovery readiness.
- `staging-readiness-manifest.template.json` is an intentionally incomplete
  names-only template; it is never deployment evidence by itself.
- `isolated-staging-release-platform.md` defines the bounded ownership and
  completion boundary for immutable artifacts and isolated environments.
- `release-promotion-runbook.md` defines build-once staging/production promotion
  and rollback by promoting a prior immutable artifact.
- `release-configuration.v1.json` records the versioned feature-flag snapshot
  embedded in release manifests.
- `promotion-record.template.json` records a staging promotion.
- `production-promotion-record.template.json` requires the exact staged workflow
  run, artifact ID, release-manifest digest, artifact-set digest, configuration
  digest, connected Player/Admin smoke, approval, and rollback target.
- `staging-player-admin-smoke.template.json` captures connected staging evidence
  for the Player and Admin beta gates.
- `environments/` contains development, staging, and production manifest
  templates. Real identities belong only in reviewed evidence records.
- `schemas/` contains machine-readable environment, release-manifest, and
  promotion-record contracts.
- `evidence/` contains non-sensitive evidence rules, blockers, and dated
  operational records. Tooling and templates are not deployment evidence.
- `production-grade-execution-plan.md` is the sequenced engineering program and
  launch gate.

The immutable artifact workflow also runs `release:validate-neutrality` and
refuses to package frontend source containing audited live project identities or
absolute Supabase/Cloudflare Worker origins.

Do not put API keys, access tokens, passwords, refresh tokens, database URLs, or
secret values in this directory. Record secret names and owners only.
