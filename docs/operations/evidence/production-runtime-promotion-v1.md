# Production Runtime Promotion V1

This release promotes the canonical schema and Edge Function set from the current merged repository into the production Supabase project while preserving production-owned application data.

## Included

- Exact production-project binding and explicit staging-project denial.
- Sanitized before/after runtime inventory.
- Equivalent migration-ledger alignment for migrations already reconciled under production-specific versions.
- Atomic execution of every remaining canonical repository migration in version order.
- Deployment of the canonical Admin, Classroom, Stock Market, Bootstrap, web-session, MFA, Player-session, and password-recovery Edge Functions.
- Issuance of missing readable Game Codes for active owned production games.
- Post-deployment function metadata, schema, RPC, and health verification.

## Excluded

- No staging Auth, Staff, Player, or synthetic game rows are copied.
- No production table is dropped by the promotion controller.
- No production Seed content release is activated by this tranche. Production Seed activation remains fail-closed until a separate exact pack, source, project, game, digest, authorization, and rollback contract is merged.

## Roll-forward policy

Repository migrations remain the source of truth. A failed migration stops the sequence immediately. Already completed migrations remain recorded and are not replayed. Repairs must be forward-only and preserve production data.
