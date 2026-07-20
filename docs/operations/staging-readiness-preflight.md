# Staging readiness preflight

This gate answers one narrow question: does a proposed immutable `main` commit
have current, repository-verifiable evidence for an isolated staging rehearsal?
It does not deploy anything, query a live service, rotate credentials, approve a
release, or manufacture missing evidence.

The validator fails closed. A missing file, stale timestamp, digest mismatch,
uncontained legacy runtime, shared environment identity, migration mismatch,
unknown Edge Function, missing secret **name**, absent recovery rehearsal, or
source commit mismatch blocks the preflight.

## Evidence boundary

Start from `staging-readiness-manifest.template.json` and write a dated manifest
under `docs/operations/evidence/` only after the referenced evidence has been
captured through the approved change-control process. The template intentionally
contains placeholders and is not readiness evidence. Because a Git commit cannot
contain its own SHA, commit evidence after the selected immutable release commit;
that follow-up commit may change only `docs/operations/evidence/**`.

Commit text evidence or compact JSON summaries when they contain no credentials,
tokens, database URLs, student data, or production data. Large or sensitive
artifacts must remain in the approved immutable evidence store; commit only a
reviewed, non-sensitive digest record that the manifest can reference.

Every evidence pointer has exactly three operational fields:

- `path`: repository-relative path to a non-sensitive evidence record;
- `sha256`: lowercase digest of that exact file;
- `capturedAt`: the actual ISO-8601 evidence-capture time.

Do not refresh a timestamp without rerunning the underlying check. Deployment,
migration, route, artifact, and approval evidence expires after 72 hours; legacy
traffic inventory expires after seven days; rollback and restore rehearsals
expire after 90 days. The deployment manifest itself expires after 24 hours.

## Required capture order

1. Select an immutable commit already merged into `main`. Build the frontend and
   every deployable Edge Function once from that commit and record SHA-256
   digests. Do not rebuild between staging and production promotion.
2. Record distinct development, staging, and production project identities.
   Staging must declare `synthetic-only`; it must not match the last audited live
   project or either other environment.
3. Configure the secret names reported by the preflight discovery. Record names
   only. Never write values to the manifest, Git, Actions output, or evidence.
4. Replay repository migrations from zero, capture the repository migration
   count/head and SHA-256 of the sorted version set, export the staging applied
   ledger, and produce the reviewed schema comparison. The full applied and
   repository version-set digests, counts, heads, and clean replay must agree.
   Compute each version-set digest from the ascending 14-digit version IDs,
   joined by `\n` with one final trailing `\n`, encoded as UTF-8.
5. Inventory every deployable function and route surface. Record the checked-in
   entrypoint SHA-256 and explicitly retain non-deployable placeholders as such.
6. Record current consumers, owner, and disposition for
   `make-server-0dbf686f`, `server`, `admin-api-staging`, and the Cloudflare
   Worker. A bridge is accepted only when read-only, explicitly approved, owned,
   and unexpired. Unknown or active-uncontained service state blocks the gate.
7. Rehearse the artifact rollback target and the isolated full restore. Record
   observed RPO/RTO and require both to meet their objectives.
8. Obtain the named staging approval only after the evidence is complete.

## Local validation

Use the repository-pinned Node and npm versions, then run:

```sh
npm ci
npm run test:deployment-readiness
npm run preflight:staging -- \
  --manifest docs/operations/evidence/staging-deployment-YYYY-MM-DD.json \
  --expected-commit <40-character-main-commit>
```

Success prints a small JSON readiness summary containing identifiers and secret
names only. Failure prints every blocking condition and exits nonzero.

## Protected workflow

Run **Staging Readiness Preflight** manually with the committed manifest path and
immutable release commit. The job requires the GitHub `staging` environment and
proves that the selected commit is an ancestor of current `main` and that every
follow-up change is confined to `docs/operations/evidence/**`. It then checks the
current repository tree against the selected commit's artifacts and evidence.
The workflow reads repository contents only; it does not receive deployment
credentials and cannot mutate infrastructure.

The validator-test job also runs on pull requests that change the preflight,
operations evidence, or package script. A green validator test is proof only
that the gate behaves correctly. It is not proof that staging is ready.

## Blocked-state response

Do not bypass a failure by deleting inventory, weakening freshness, using a
different commit, or changing a status without evidence. Capture or correct the
named evidence through the normal release path and rerun. Live schema-ledger
repair, legacy disablement, credential rotation, environment creation, restore,
rollback, and deployment remain owner-approved external actions.
