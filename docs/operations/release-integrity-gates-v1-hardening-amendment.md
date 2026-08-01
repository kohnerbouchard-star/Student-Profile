# Release Integrity Gates v1 — Hardening Amendment 2

Status: binding amendment to `docs/operations/release-integrity-gates-v1.md`

Date: 2026-08-01

Branch: `fix/release-integrity-gates`

## Reason for amendment

A post-implementation audit found several internal inconsistencies and incomplete controls:

- database URL validation existed in two implementations, only one of which enforced a Supabase pooler hostname;
- schema comparison could classify an approved difference as `EXPECTED_DIFFERENCE`, while attestation accepted only literal `PASS` statuses;
- pull-request workflows validated the branch head instead of the GitHub merge candidate;
- authorization fingerprints omitted object ownership and relevant role attributes and memberships;
- routine definitions were reduced to MD5 before inclusion in a SHA-256 envelope;
- database TLS used encryption without certificate and hostname verification;
- the live migration query sorted rows before comparison, making claimed historical ordering detection unsupported;
- later binding amendments were not included in workflow path filters.

The audit also confirmed that production and staging currently differ materially. This amendment does not authorize reconciliation. The gate must report and block that drift.

## Superseding decisions

### A1. One database-binding authority

`scripts/release-integrity/database-binding.mjs` is the only implementation of Supabase database URL binding. Other modules may re-export it but must not duplicate its logic. All unit, workflow, and CLI tests must exercise the same implementation.

### A2. Zero-exception schema parity in v1

Release Integrity v1 has no approved-difference mechanism. Any structural or authorization fingerprint difference is `UNAPPROVED_DRIFT`. The expected-difference contract file and CLI allowlist input are retired. A later version may introduce reviewed exceptions only with a new evidence schema and explicit approver identity.

### A3. Merge-candidate validation

For pull requests, static and contract workflows validate `github.sha`, which is GitHub's synthetic merge commit for the pull-request event. The workflows also support `merge_group` so repositories using merge queue validate the queued merge candidate. No workflow checks out user-supplied executable code.

### A4. Stable authorization evidence

Authorization evidence includes:

- schema ownership;
- relation ownership;
- routine ownership;
- RLS state and policies;
- table and routine grants;
- default privileges;
- attributes for application-relevant roles and object owners;
- memberships involving those relevant roles.

Environment-specific object identifiers are prohibited.

### A5. SHA-256 routine identity

Routine definitions are represented using a direct SHA-256 digest of the complete `pg_get_functiondef` text. MD5 is prohibited.

### A6. Certificate-verified TLS

Live parity uses `PGSSLMODE=verify-full` and a protected `SUPABASE_DB_CA_CERT` secret. The workflow writes the certificate to a temporary permission-restricted file, sets `PGSSLROOTCERT`, and removes the file on completion. Missing certificate material fails closed.

### A7. Canonical ledger identity, not historical application order

The live ledger is exported in canonical version order. The comparison detects missing repository migrations, live-only migrations, same-version name mismatches, and duplicate versions. It does not claim to reconstruct historical application order when the ledger lacks a trustworthy application-order field.

### A8. Governing-document trigger coverage

Workflow path filters cover `docs/operations/release-integrity-gates-v1*.md`, so this and future v1 amendments trigger the same validation.

## Required implementation sequence

1. Commit this amendment.
2. Consolidate database URL validation.
3. Remove approved-difference behavior and artifacts.
4. Strengthen schema authorization and routine evidence.
5. Upgrade workflow TLS to `verify-full`.
6. Validate pull-request merge candidates and add `merge_group` support.
7. Update unit and workflow contracts.
8. Run the full release-integrity test suite and diff hygiene checks.
9. Re-audit the exact resulting branch head.

## Acceptance additions

The branch is not mergeable until:

- only one database-binding implementation exists;
- any schema difference blocks attestation;
- MD5 is absent from the schema exporter;
- relevant ownership and role evidence is present;
- live workflow TLS requires certificate and hostname verification;
- pull-request validation targets the synthetic merge SHA;
- `merge_group` is supported;
- all v1 governing documents trigger validation;
- exact-head GitHub checks and a Vercel preview succeed;
- live staging and production drift remains explicitly blocked until separately reconciled.
