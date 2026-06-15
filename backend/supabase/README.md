# Supabase

Deployable Supabase assets live here.

- `migrations/` is where SQL migrations will go once schema work begins.
- `seed.sql` is the starting point for seed data once schema exists.
- `functions/` contains Supabase Edge Function projects.
- `functions/classroom-api/` will become the compatibility API router.
- `functions/stock-market-runner/` will become the scheduled stock update runner.
- `functions/notification-worker/` will process notification jobs.
- `functions/_shared/` is for code shared by Edge Functions only.

## Supabase implementation order

1. Core loop/schema design doc
2. Reviewed SQL migrations
3. RLS policy design
4. Edge Function API layer
5. Frontend wiring
6. Scheduled jobs

- Never expose service-role keys to the frontend.
- RLS must be enabled on exposed app tables.
- Purchase code redemption is server-side only.
- Ledger writes are server-side only.
- `game_session_id` isolation must be preserved in migrations, policies, and Edge Functions.
- Private player data must be protected by both `game_session_id` and `player_id`.
- Active student codes must be unique inside each `game_session_id`.
- The future SQL migrations should follow the documented Future SQL Shape unless a later reviewed design change says otherwise.
