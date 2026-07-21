# Executable beta seed pack v1

This directory is generated deterministically from PR #163. It contains only the bounded beta subset: 240 market instruments, ten three-step tutorial Contract chains, 50 Store entries, 144 calibrated physical-economy definitions, and 50 artwork-verified locations.

Production is prohibited. Definitions remain inactive by default. A connected import requires an isolated non-production project, an explicit project-ref match, a game-session UUID, and environment-scoped service credentials. Activation additionally requires an external, unexpired authorization matching the pack SHA-256.

Validation and dry run:

~~~zsh
node scripts/seed-beta-importer.mjs --mode validate --environment test
node scripts/seed-beta-importer.mjs --mode dry-run --environment staging --expected-project-ref <isolated-ref> --game-session-id <uuid>
~~~

Import without activation:

~~~zsh
SEED_TARGET_ENVIRONMENT=staging SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...   node scripts/seed-beta-importer.mjs --mode import --environment staging   --expected-project-ref <isolated-ref> --game-session-id <uuid>
~~~

The importer writes a rollback bundle and an audit record under .seed-audit/. Do not commit that directory.
