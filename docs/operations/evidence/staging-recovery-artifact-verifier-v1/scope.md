# OPS-STAGE-001 — staging recovery artifact verifier

The source-only verifier accepts an independently pinned GitHub artifact for a
staging release. The ZIP contains one bounded, redacted recovery.json object.
The verifier compares the selected artifact ID, raw ZIP SHA-256, producer run,
repository, exact current main release, staging target and canonical suffix batch.
It retains the scope, freshness, measured RPO/RTO and eight acceptance checks for
the native and managed restore target forms.

The caller must obtain producer and current apply-run metadata and each run's
review history directly from the same repository's trusted GitHub API. The named
human reviewer must differ from the recovery operator and both run actors. Any
review fields embedded in the ZIP are rejected. The synthetic fixture proves
validation behavior. The fixture grants no release approval.

Read-only local check with Node 22.23.1 and Python 3:

    node --test scripts/operations/staging-recovery-evidence/verify.test.mjs

The PR workflow runs only that fixture, without a protected environment or a
database step. The protected producer and apply transport still require separate
authorization and integration review. Allowlisted transport must download and
verify the receipt and review histories before database credentials are exposed.
Real recovery timing, custody, Auth/Storage/Edge and connected acceptance,
runtime-catalog equality, suffix qualification and the staging write fence
remain operational prerequisites.
