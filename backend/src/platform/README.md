# Platform

Platform code is for infrastructure and runtime adapters shared by backend domains.

- `supabase/` is for future Supabase client, auth, and storage integration.
- `scheduler/` is for future scheduled job runtime integration.
- `realtime/` is for future realtime channel and event delivery integration.

Do not put domain business rules in platform code.
