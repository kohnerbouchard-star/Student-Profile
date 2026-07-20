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

## 2026-07-20 final Phase 0 reconciliation

PR #251 merged owner-safe branch retirement as `89bfadfb0d609ef92081fda575f0e1e998b2650d`. Its final implementation head passed Repository Quality #1084, Database Replay #345, Staging Readiness Preflight #99, and Admin Game Lifecycle Controls #33.

Duplicate and donor disposition is complete:

- PR #246 was labeled `duplicate`, closed after its source-snapshot artifact was consumed, and `agent/player-market-portfolio-v1` was deleted by Branch Hygiene run #100. PR #245 remains the sole market-order and Portfolio authority.
- PR #253 duplicated the Player recovery tranche already owned by earlier PR #247. It was labeled `duplicate` and closed; `feat/player-recovery-states-v1` no longer exists. Its useful lifecycle, safe-copy, source-integration, and contract-test ideas were explicitly dispositioned on PR #247 before PR #247 merged as `ad889a2bdf9d5587fff3275d70751c79992171c7`.
- PR #255 was an aborted premature roadmap seal. It was labeled `duplicate`, closed without merge, and `docs/program-control-phase0-seal-v1` no longer exists.
- PR #260 duplicated the incident-readiness roadmap verification already owned by earlier PR #259. Its unique completed-amendment evidence was transplanted into PR #259, it was labeled `duplicate` and closed, and `docs/incident-readiness-verification-v1` no longer exists.
- The merged PR #251 branch was deleted automatically.

The final active capability authorities at the audit boundary are:

- PR #163 — seed-content definition, calibration, and executable-content preparation;
- PR #244 — Player story-notification delivery;
- PR #245 — Player market orders and Portfolio;
- PR #248 — Messaging and communication;
- PR #249 — Player Marketplace lifecycle;
- PR #261 — Progression, reputation, and achievements.

Recently completed parallel tranches are merged rather than active authorities: Player recovery PR #247, supply-chain PRs #250/#258, incident-readiness PR #252, and Dashboard/Profile PRs #254/#257. Branch-only work without an open pull request is not authoritative and must not be treated as a capability claim.

This reconciliation leaves no overlapping active pull request over the same capability. Future agents must search current open pull requests and the capability ownership registry before creating a branch, and must use the explicit `duplicate` label before a closed unmerged branch may be deleted automatically.

The final maintainer-authored authority scan was recorded against `main` `ad889a2bdf9d5587fff3275d70751c79992171c7` before PR #259 review.

## 2026-07-20 post-seal stale-helper cleanup

After PR #259 merged as `e2483e25d767cbe5714735c627093d9968507908`, the final audit found `.github/workflows/incident-roadmap-finalize.yml` on `main`. PRs #265–#268, #271, and #272 installed, retargeted, and repeatedly revised that one-shot write-capable helper after incident-readiness evidence was already authoritative. It regenerated or targeted duplicate PRs #260, #270, and #273. A separate push-gated replacement on PR #275 was retired before merge.

PRs #260, #270, and #273 were labeled `duplicate`, closed, and their branches `docs/incident-readiness-verification-v1`, `docs/incident-readiness-verification-clean-v1`, and `docs/incident-readiness-final-v2` were deleted. PR #276 then merged the completed market-finalizer removal but deliberately retained the stale incident job. PR #269 removes that remaining unreachable helper from current `main`. Deleting it loses no implementation or verification evidence and prevents further regeneration of retired duplicate branches.

The final PR #269 review scope is limited to the workflow deletion and this operations record.
