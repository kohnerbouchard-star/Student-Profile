# GitHub branch cleanup record — 2026-07-17

## Decision

The initial remote inventory contained 107 branches and only one open pull
request. A 108th branch appeared during the audit from parallel player-terminal
work. The cleanup therefore retains four currently known branches:

- `main` — default branch;
- `feat/contracts-end-to-end-wiring` — open draft PR #138 and current work;
- `frontend/admin-terminal-source-v1` — six unique source-preservation commits
  that may help de-bundle the generated admin runtime. Review and archive this
  material deliberately before deleting its last named ref.
- `agent/player-terminal-v75-readiness` — concurrent player-frontend work that
  appeared after the initial inventory and must not collide with this cleanup.

The audit approved 104 branches for deletion:

- 97 are heads of merged pull requests;
- two belong to closed, unmerged PRs whose work was superseded;
- four no-PR checkpoint/backup branches are already ancestors of `main`;
- one no-PR Edge import hotfix was superseded by the merged explicit-import
  repair.

The authenticated cleanup completed successfully. A final `git fetch --prune`
and remote inventory confirmed that only the following branch refs remain:

- `main`;
- `feat/contracts-end-to-end-wiring`;
- `frontend/admin-terminal-source-v1`;
- `agent/player-terminal-v75-readiness`.

Deleting the 104 obsolete branches did not delete merged pull requests or
remove their history from `main`; it removed only the obsolete movable branch
names.

## Execution boundary

The deletion was performed from an authenticated maintainer checkout with an
exact audited allow-list. The command defaulted to a dry run, refused to target
a different remote, and left every branch not explicitly listed untouched.
The one-time command file was intentionally not retained in the repository
after successful execution because its allow-list is now exhausted.

After the cleanup is merged, `.github/workflows/branch-hygiene.yml` deletes
same-repository pull-request branches automatically when their PR is merged.
It retains the default branch and the admin source-preservation branch.

## Ongoing policy

- Keep `main`, active PR branches, and explicitly documented archival refs.
- Delete a normal feature/fix branch immediately after merge.
- Prefer immutable release tags and manifests over long-lived `backup/*`
  branches.
- Do not use branches as deployment environments.
- Review the remaining admin source branch during the transport/de-bundling
  program and either merge useful source, tag a documented archive, or delete
  it.
