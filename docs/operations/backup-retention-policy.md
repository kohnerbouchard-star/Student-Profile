# Backup Retention and Recovery Objectives

This policy governs isolated staging rehearsals and future approved production recovery operations. It does not authorize a production backup, restore, deletion, or credential change.

## Objectives

| Recovery domain | Proposed RPO | Proposed RTO |
|---|---:|---:|
| Database schema and migration ledger | 24 hours | 4 hours |
| Application data and financial ledger | 24 hours | 4 hours |
| Auth mapping and configuration names | 24 hours | 6 hours |
| Storage inventory and referenced objects | 24 hours | 8 hours |
| Edge Function source and release identity | One approved release | 2 hours |

## Retention

- Keep at least seven daily encrypted recovery points when platform capability permits.
- Keep four weekly recovery points.
- Keep one monthly recovery point for twelve months when approved storage and cost controls exist.
- Store encrypted archives in an approved immutable location outside the source platform.
- Record SHA-256, byte size, source commit, migration head, creation time, and custody reference.
- Never commit archive bytes, credentials, connection strings, access codes, or encryption material.

## Safety gates

- Source, target, and production identities must be explicit.
- Source and target must differ.
- Target must not match production.
- Restore execution must be separately approved and run only against an isolated synthetic target.
- Evidence must remain redacted and must identify failures and manual interventions.
- Production promotion remains outside this policy and requires separate authorization.
