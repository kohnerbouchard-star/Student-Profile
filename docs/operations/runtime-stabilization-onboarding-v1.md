# Runtime Stabilization and Two-Player Onboarding V1

## Source boundary

- Base main: `a76c9a419105773f1b6a8d6fdc3d7664fcada261`
- Branch: `agent/runtime-stabilization-onboarding-v1`
- Production deployment: prohibited
- Staging deployment: not performed
- Feature semantics: unchanged
- Financial Markets activation: unchanged and disabled

## Repairs

1. Enable the local Supabase Edge Functions runtime so `admin-api` and `classroom-api` can be served by `npm run dev:local`.
2. Replace `apply_arrival_grant_command_v1` forward-only with explicitly qualified table predicates, preventing PL/pgSQL collisions with `RETURNS TABLE` output variables such as `player_id`.
3. Exercise the exact nested Admin terminal ledger-adjustment envelope and preserve the legacy form-alias contract.
4. Execute two disposable Players through Arrival assignment, starting-balance credit, progression initialization, travel/residency initialization, and committed-success replay.
5. Preserve the current-main first-game license-redemption rollback probe while extending the same provisioning workflow.

## Acceptance requirements

- Local `admin-api` and `classroom-api` answer authenticated `OPTIONS` probes with HTTP 204.
- Database rebuild from zero succeeds.
- Canonical V1 source provisioning succeeds.
- Full-game V2 provisioning succeeds with exact content gates and counts.
- First-game license redemption provisions a ready game and rolls back its synthetic evidence.
- Analyst and Builder Players each receive one Arrival receipt and one Arrival ledger entry.
- Starting balance equals the approved country-currency Arrival amount.
- Progression, travel, and residency records exist and match the assigned country/class.
- Replaying the Arrival command returns `replayed` and creates no second ledger entry.
- Browser ledger requests expose canonical top-level amount, direction, account, currency, reason, Player identifier, and idempotency fields to the backend.
- Evidence contains no plaintext Game Code, credentials, or raw internal UUIDs.
