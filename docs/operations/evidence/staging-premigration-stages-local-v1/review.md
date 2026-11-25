# REF-032 / OPS-STAGE-001: bounded pre-migration stage attribution

LOCAL_ONLY; base e6bf130c63e9940538dd46938f221f99b9ffba3f. No hosted connection,
mutation, provider change, publish, workflow dispatch, merge or deployment.

## Historical evidence: cause UNKNOWN

Run 45700466251 bound held main to clean replay 45622845306 and completed the
read-only staging capture. Sanitized artifact 15063221117 reports FAILED/exit 1,
unresolved execution, no applied/certified migrations and null stage/SQLSTATE/
migration/prefix count. No raw log or dump remains. The earlier P0001 failure is
not evidence for this run. No historical SQLSTATE is inferred here.

Parent-verified timing: job 139508899305's disposable step lasted 49 seconds,
21:04:33–21:05:22 UTC. Exhausting all three ordinary startup retries sleeps 60
seconds even before startup cost. This prioritizes isolation/preflight/restore
investigation, but does not exclude startup-adjacent failure. Null comparison
means cleanup did not retain/record both post exports; it does not rule out later
fixture, prerequisite or ledger failure followed by secondary cleanup failure.

Reachable pre-migration exits include:
- Local startup/retry exit and Docker inventory/network disconnection.
- CA existence/hash/expiry, certificate copy/mode and local privileged-role check.
- Capture file/checksum/schema-row boundary and local schema reset/restore.
- Captured-staging source/job/project/paths/Docker identity/egress/freshness guard;
  repository seed validation; disposable fixture SQL or its exact digest guards.
- pg_cron install and exact version/schema/table identity check.
- Pre-schema and runtime-catalog exports.
- Ledger file capture/copy, exact plan partition, prefix/name/digest verification.

None can be selected as this historical run's cause from the artifact alone.
Missing required inputs or an unwritable diagnostics directory before setup may
still produce the workflow's existing NOT_QUALIFIED fallback rather than a stage.

## Implemented bounded diagnostics

A fixed enum identifies source planning/capture integrity, startup, isolation,
local authority, schema capture/row boundary/reset/restore, fixture authority vs
apply, prerequisite install vs verification, pre exports, ledger capture vs
classification/prefix verification, qualification post exports and comparisons.
No command text, stdout, stderr, SQL, row value, credential or capture path is
accepted as a public stage. Unknown stage contents become a fixed unclassified
label, with null SQLSTATE/migration. Existing migration diagnostics and allowlisted
SQLSTATEs are preserved. Fixed ledger error classes are now projected; the old
projection discarded them. Unknown classes are suppressed.

The EXIT trap is active before source planning/capture validation. A missing or
incomplete plan cannot erase an already failed diagnostic just because summary
construction tries to parse the partial plan. Cleanup records the primary stage
before best-effort exports/stop; secondary cleanup failure cannot replace it or
abort the summary. Qualification exports separately fail closed at their first
export boundary. Private raw captures/logs remain private and are deleted by the
existing workflow; the only uploaded path remains u1/sanitized/result.json.
Authorization, exact source/replay binding, staging/project guards, local Docker
identity/socket and egress protections are retained. No protected setting or
historical migration changes. The existing migration loop is unchanged.

## Directly reproduced local defect (NOT a diagnosis of the historical run)

Normal Bash proves that `set -e; for x in $(false); do ...; done` returns success
and can continue after failed inventory. The actual shell synthetic harness also
reproduced failed Docker inspection skipping the network loop and reaching a
later stage. The correction assigns the Docker inventory in a separate command
before iterating, so inspection failure exits at local-network-isolation. No
inspection error is ignored, and no network restriction is relaxed.

This is a directly demonstrated fail-open shell boundary, not evidence that
Docker inspection failed during run 45700466251. All other historical cause
hypotheses remain unknown and are not 'fixed' by weakening guards.

## Tests and limits

Targeted tests execute the actual shell using synthetic command stubs and normal
Bash/Node/hash tools, without Docker or hosted connections. Sixteen injected
pre-migration boundaries retain the exact primary stage and zero migration
application. The cleanup command is independently failed, proving its private
stderr cannot erase the first stage or leak into summary. Canary command stderr,
row payload and credential-like strings do not enter public JSON. Separate tests
exercise fixture authorization before SQL, fixture apply-stage recording,
existing migration SQLSTATE preservation, fixed public projection and both
qualification export failure boundaries.

Retained native PostgreSQL tests cover shared-snapshot capture and the earlier
repository-topology fixture proof; these are not reproduction of this run's
specific failure. Actual Docker startup/isolation/schema restore of the destroyed
capture, new protected replay, and historical SQLSTATE remain unverified.

Exact local qualification and checksum-verified patch/bundle identities are
reported with this candidate. Do not publish or dispatch it without parent review.
Next: review diagnostic candidate; independently qualify source controls, then
separately authorize a fresh exact-source protected rehearsal to obtain evidence
for the historical unknown. No apply-readiness or release certificate claim.

Final source qualification: 52/52 PASS on pinned Node 22.23.1, no skips, including
16 injected pre-migration boundaries and retained native PostgreSQL snapshot and
fixture regressions. Migration source validation, shell syntax, secret scan and
whitespace checks pass. Historical migrations, capture/provider entry point,
source binding and broad held production/staging workflows are unchanged.
