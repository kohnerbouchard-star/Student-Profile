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

## Environments

Create protected `staging` and `production` environments. Production must have
a named reviewer, no self-approval, separate secrets, deployment history, and a
maintenance/rollback owner. Only immutable artifacts already verified in
staging may be promoted.

These GitHub environments are release controls; they are not substitutes for
separate Supabase projects and credentials.
