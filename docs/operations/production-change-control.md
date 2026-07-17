# Production change control

## Current rule

Production schema changes and dashboard source edits are frozen until the live
migration ledger is reconciled and an isolated staging environment exists.
Emergency security containment is allowed only with an identified approver,
captured pre-change state, a tested rollback, and immediate back-port to Git.

No production change may originate from an unmerged branch during the normal
path. No credential may be copied into an issue, pull request, artifact, or log.

## Normal release path

1. Merge a reviewed, bounded pull request after required checks pass.
2. Build once from the immutable merge commit and create a release manifest.
3. Apply migrations to an isolated staging project from the repository only.
4. Deploy the same function/frontend artifacts to staging.
5. Run database replay, authorization-matrix, browser, and API smoke tests.
6. Obtain the named production approval and record the maintenance window.
7. Promote the same artifacts; do not rebuild for production.
8. Verify health, release SHA, migration head, and critical user journeys.
9. Keep the rollback owner present through the observation window.

## Database rule

Forward migrations are the only normal schema mutation. A migration must be
transactional where PostgreSQL permits, replay from zero twice in CI, preserve
tenant/game scope, and include a forward corrective rollback plan. Manual SQL
is an incident action, not a release mechanism.

Migration-ledger repair is exceptional. It requires a live schema-only dump,
checksums for both ledgers, an independently reviewed mapping, a dry run against
a restored copy, and a full backup. Never mark versions applied merely because
their names look similar.

## Emergency path

The incident lead records the reason, scope, approver, operator, start time,
pre-change snapshot, rollback trigger, and verification evidence. The smallest
containment change is applied. The change is then represented in Git and
reviewed within one business day. Emergency authority does not include deleting
data, disabling an unknown consumer, or accepting a paid-plan change without
the relevant owner.

## Required release-manifest fields

- Git commit and repository/ref
- frontend artifact digest and visible release identifier
- each Edge Function artifact digest and deployed version
- database migration head and schema digest
- configuration schema version and enabled capability flags
- staging evidence, approver, operator, deployment time, and rollback target
