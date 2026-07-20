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
- `production-grade-execution-plan.md` is the sequenced engineering program and
  launch gate.

Do not put API keys, access tokens, passwords, refresh tokens, database URLs, or
secret values in this directory. Record secret names and owners only.
