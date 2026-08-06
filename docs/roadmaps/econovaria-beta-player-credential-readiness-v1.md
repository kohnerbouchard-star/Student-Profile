# Econovaria Beta — Player Credential Runtime Readiness v1

Status: implementation branch; production mutation not authorized by this file.

Base commit: `31e1958abc063a8d19cf8e00a9b499623d5b4532`

## Scope item: BETA-PROD-PLAYER-CREDENTIAL-007

Goal: restore Player creation, Player access-code reset, Player login upgrade, and attendance credential lookup without rotating any active credential material or changing unrelated production configuration.

Production preflight on 2026-08-06:

- Total credential rows: 16.
- Legacy `sha256-v1` rows: 14.
- Active `pbkdf2-sha256-v2` rows: 0.
- Revoked `pbkdf2-sha256-v2` rows: 2.
- Decision: a new create-only pepper is permitted because no active v2 credential depends on an unrecoverable prior pepper.

Implementation boundaries:

- Add one dedicated, manually dispatched production workflow that sets only `ECONOVARIA_PLAYER_CREDENTIAL_PEPPER`.
- Refuse to overwrite the secret when it already exists.
- Require exact production project, exact `main` SHA, zero-active-v2 confirmation, and a protected production environment.
- Emit one retryable `503 player_credential_runtime_unavailable` response without exposing the secret name or internal configuration details.
- Preserve the canonical Admin gateway client-IP binding already validated in production.
- Apply no database migration, Vercel deployment, Edge Function deployment, or production secret mutation from this branch.

Required verification:

1. `player-credential-runtime-readiness`
2. `backend-typecheck`
3. `admin-api-check`
4. `npm --prefix backend run test:admin-local-mutations`
5. Staging Player create, access-code reset, Player login, attendance by Player ID, and attendance by Access Code.
6. Production workflow dispatch only after merge and exact-SHA confirmation.
7. Post-provision verification that the secret name exists and no active v2 credential count changed.

Release order:

1. Merge the reviewed source branch.
2. Dispatch `Production Player Credential Pepper Provision` from the exact merged `main` SHA.
3. Confirm Player operations recover before any wider deployment.
4. Deploy matching `admin-api` and `classroom-api` source to staging, run acceptance, then promote those functions to production.
5. Do not rotate the pepper after active v2 credentials are issued; future rotation requires versioned multi-pepper migration support.
