# Supabase

Deployable Supabase assets live here.

- `migrations/` is where SQL migrations will go once schema work begins.
- `seed.sql` is the starting point for seed data once schema exists.
- `functions/` contains Supabase Edge Function projects.
- `functions/classroom-api/` will become the compatibility API router.
- `functions/stock-market-runner/` will become the scheduled stock update runner.
- `functions/notification-worker/` will process notification jobs.
- `functions/_shared/` is for code shared by Edge Functions only.
