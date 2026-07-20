# Required GitHub repository settings

These controls must be applied to `kohnerbouchard-star/Student-Profile` after
the new workflows have run successfully at least once. GitHub cannot require a
status check before that check has reported to the repository.

## Main branch ruleset

Target `main` and configure:

- require a pull request before merging;
- require one approval and CODEOWNERS review for matched critical paths;
- dismiss stale approvals when new commits are pushed;
- require conversation resolution;
- require branches to be up to date before merge;
- block force pushes and branch deletion;
- restrict direct pushes to the production/release owner;
- allow emergency bypass only for the documented incident role, with audit;
- prefer squash merge for bounded feature branches.

Required checks after their first successful run:

- `Admin API Check / admin-api-check`
- `Admin Shell Smoke / admin-shell-smoke`
- `Backend Typecheck / backend-typecheck`
- `Admin Bundle Contract Audit / audit`
- `Database Replay / replay`
- `Repository Quality / quality`
- `Release Artifact Build / Release platform contract tests`
- `Release Promote Exact Artifacts / Promotion contract tests`

Do not require browser or database checks until their first clean run proves the
workflow names and runner prerequisites. A permanently missing required check
can lock every pull request.

## Repository merge settings

- enable automatic deletion of head branches after merge as a second layer
  behind `.github/workflows/branch-hygiene.yml`;
- keep squash merge enabled;
- disable merge commits after current stacked-branch work is complete if linear
  history is adopted;
- enable vulnerability alerts, Dependabot security updates, secret scanning,
  push protection, and private-vulnerability reporting where available;
- restrict Actions to trusted actions and require approval for first-time
  external contributors.

## Protected release environments

Create GitHub environments named exactly `development`, `staging`, and
`production`.

`development`:

- restrict use to repository development workflows;
- use development-only Supabase and frontend identities;
- use synthetic data only;
- keep all secrets environment scoped.

`staging`:

- require a named reviewer;
- restrict deployment branches to `main`;
- use staging-only Supabase and frontend identities;
- use synthetic data only;
- retain deployment history;
- configure a rollback owner;
- authorize only an immutable artifact ID produced by `Release Artifact Build`.

`production`:

- require a named reviewer and prevent self-approval where supported;
- restrict deployment branches to `main`;
- use production-only Supabase and frontend identities;
- retain deployment history and maintenance-window evidence;
- require a rollback owner through the observation window;
- authorize only the exact artifact ID and artifact-set digest already verified
  by connected staging Player and Admin smoke.

Use separate values in every environment for these secret names:

- `FRONTEND_DEPLOY_TOKEN`;
- `SUPABASE_ACCESS_TOKEN`;
- `SUPABASE_ANON_KEY`;
- `SUPABASE_PROJECT_REF`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `SUPABASE_URL`.

Do not put secret values in repository variables, manifests, pull requests,
workflow output, logs, or evidence. These GitHub environments are release
controls; they are not substitutes for separate Supabase projects, frontend
targets, credentials, and data policies.
