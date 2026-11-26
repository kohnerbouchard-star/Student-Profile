# OPS-STAGE-001 — protected recovery evidence transport

This draft adds an exact-main, staging-only manual publisher for a redacted
recovery summary, plus a protected evidence preflight. The publisher verifies
the actual GitHub review history alongside the existing recovery contract
before offering one bounded recovery.json artifact. The preflight accepts the
producer run ID, artifact ID and GitHub sha256 ZIP digest from that separate run.
This removes the in-tree receipt requirement without weakening source identity.

The preflight reads both runs' independent staging approvals from GitHub, checks
exact-main replay and rehearsal provenance, and requires the runtime catalog to
match exactly. It reuses the suffix receipt gate and held qualification record
from e68862aceb5bfc3c198cccf7cd951a73c3b5d2db. It has no database credentials,
SQL execution, deployment step or invocation of the held apply runner. A valid
evidence bundle reports apply held until the authoritative all-caller fence and
old-worker drain can be separately reviewed.

The artifact will contain only the redacted JSON when the publisher is separately
authorized to run. Backup bytes and private custodian evidence stay outside GitHub.
The review is scoped to synthetic fixtures, workflow trigger safety and archive
binding. Actual approval, recovery timings and all live evidence remain pending.

Local verification with Node 22.23.1 and Python 3 from the repository root:

    node --test scripts/operations/staging-recovery-evidence/verify.test.mjs
