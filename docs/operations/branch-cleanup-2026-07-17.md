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

## 2026-07-20 parallel-work ownership reconciliation

A current pull-request audit found four pre-consolidation open authorities:

- PR #163 / `agent/seed-content-foundation-v1` — sole seed-content authority;
- PR #244 / `agent/player-story-delivery-v1` — Player story-notification delivery;
- PR #245 / `agent/player-market-reconciliation-v1` — substantive market-order and Portfolio implementation;
- PR #246 / `agent/player-market-portfolio-v1` — duplicate market ownership claim containing only a temporary source-snapshot workflow and claim marker.

PR #245 is retained as the market authority because it contains the substantive public-safe market contract changes. PR #246's successful source-snapshot artifact was consumed to conduct the reconciliation; it contains no unique application implementation requiring transplant and is approved for explicit duplicate retirement.

Branch Hygiene now deletes either:

1. a merged same-repository pull-request branch; or
2. a closed, unmerged same-repository pull-request branch carrying the explicit `duplicate` label.

Closed unmerged branches without that label remain untouched. The default branch and `frontend/admin-terminal-source-v1` remain protected exceptions. `scripts/branch-hygiene-policy.test.mjs` ratchets these fail-closed rules in Repository Quality.

The resulting active ownership set is unique: seed content (#163), story delivery (#244), and market reconciliation (#245). Future parallel chats must read the roadmap and open pull requests before creating a branch.
