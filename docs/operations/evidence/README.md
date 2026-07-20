# Release evidence records

This directory contains reviewed, non-sensitive evidence records for isolated
staging, immutable artifact promotion, rollback, restore, and connected smoke.
A template, plan, workflow definition, or validator output produced without a
real target is not staging evidence.

## Admissible records

- environment identities and provider-assigned target names;
- source commit, release ID, GitHub workflow run ID, artifact ID, checksums, and
  artifact-set digest;
- migration head/count/version-set digest and reviewed comparison result;
- deployed frontend release identifier and Edge Function version inventory;
- protected-environment approver, operator, timestamps, and maintenance window;
- synthetic-data-only Player/Admin smoke results;
- rollback and restore timing/results;
- digests for large or sensitive evidence retained in the approved evidence
  store.

## Prohibited content

Do not commit or print:

- secret values, tokens, passwords, private keys, or connection strings;
- service-role, access, refresh, or student session tokens;
- student records, access codes, ownership UUIDs, or raw sensitive payloads;
- production data copied into a lower environment;
- unreviewed claims that a workflow definition proves a deployment occurred.

## Naming

Use dated, release-specific names such as:

- `staging-environment-YYYY-MM-DD.json`;
- `release-<commit>.json`;
- `staging-promotion-<commit>.json`;
- `staging-player-admin-smoke-<commit>.json`;
- `production-promotion-<commit>.json`;
- `rollback-<from>-to-<to>.json`.

Every referenced evidence file must have a lowercase SHA-256 digest calculated
from its exact committed bytes. Capture timestamps must reflect the actual check;
do not refresh timestamps without rerunning the underlying operation.
