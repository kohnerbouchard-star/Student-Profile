# Contributing to Econovaria

## Branches and pull requests

- Start work from current `main` and use a short-lived `feat/`, `fix/`,
  `refactor/`, `docs/`, or `chore/` branch.
- One pull request should deliver one bounded capability or correction.
- Delete a normal branch after merge. Preserve releases with immutable tags and
  release manifests, not `backup/*` branches.
- Do not deploy from an unmerged branch except the documented emergency path.
- Keep the pull request draft until its required checks and live/staging gates
  are satisfied.

The current exception is `frontend/admin-terminal-source-v1`, retained until
its unique source-preservation commits are reviewed during admin de-bundling.

## Required local checks

```zsh
nvm use
npm ci
npm --prefix backend ci
npm test
npm --prefix backend run typecheck:all
npm --prefix backend run smoke
```

Run the relevant browser tests for UI changes. SQL changes must also pass the
Docker-backed database replay and lint workflow.

## Database changes

- Add a new forward migration; do not edit an already-applied production
  migration without an explicit, reviewed reconciliation procedure.
- Wrap critical migrations in a transaction where PostgreSQL permits.
- Preserve `game_session_id` isolation and index foreign keys used for joins or
  cascading deletes.
- Include data compatibility, rollout, verification, and forward-correction
  notes in the pull request.
- Never run dashboard/manual production SQL as a normal release step.

## API and security changes

- Authenticate and authorize before service-role data access.
- Test wrong-role, wrong-game, wrong-player, expired/revoked, valid-owner, and
  replay/idempotency behavior.
- Never commit credentials or student-sensitive data.
- Add rate-limit and audit implications for new public or privileged actions.

## Release changes

Follow `docs/operations/production-change-control.md`. A release must identify
the immutable Git commit, artifact hashes, migration head, configuration
version, staging evidence, approver, rollback target, and observation window.
