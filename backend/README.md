# Backend

Backend workspace for the Classroom Economy / Eco Novaria Supabase migration.

This checkpoint establishes the backend folder structure only. It does not add SQL schema, RLS policies, Edge Function handlers, stock calculations, or frontend wiring.

## Folder layout

- `legacy/` is reference material only. Existing Apps Script and workbook exports remain unchanged and should not be edited for new backend module work.
- `supabase/` contains deployable Supabase assets, including future migrations, seed data, Edge Functions, and Edge Function shared code.
- `src/domains/` contains self-contained product modules with clear ownership boundaries.
- `src/platform/` contains adapters to infrastructure and runtime concerns such as Supabase, scheduling, and realtime behavior.
- `src/shared/` contains small cross-domain helpers only and should not become a dumping ground.
- `scripts/` contains local, import, and maintenance scripts used outside runtime code.
