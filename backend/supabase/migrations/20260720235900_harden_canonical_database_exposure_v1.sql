begin;

-- Reproducible isolated-staging findings after the canonical 70-migration replay:
-- two PostgREST-exposed tables retained default browser-role privileges without
-- RLS, and four SECURITY DEFINER RPCs retained implicit EXECUTE grants through
-- PUBLIC. Keep browser access mediated by trusted Backend/Edge routes.

alter table public.currencies enable row level security;
alter table public.game_lifecycle_transition_requests enable row level security;

revoke all privileges on table public.currencies
  from public, anon, authenticated;
revoke all privileges on table public.game_lifecycle_transition_requests
  from public, anon, authenticated;

grant select on table public.currencies to service_role;
grant select on table public.game_lifecycle_transition_requests to service_role;

revoke all on function public.initialize_demo_storyline_for_game(uuid, text)
  from public, anon, authenticated;
revoke all on function public.seed_default_store_items(uuid)
  from public, anon, authenticated;
revoke all on function public.read_admin_game_lifecycle_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.transition_game_lifecycle_atomic_v1(uuid, uuid, text, text, bigint)
  from public, anon, authenticated;

grant execute on function public.initialize_demo_storyline_for_game(uuid, text)
  to service_role;
grant execute on function public.seed_default_store_items(uuid)
  to service_role;
grant execute on function public.read_admin_game_lifecycle_v1(uuid, uuid)
  to service_role;
grant execute on function public.transition_game_lifecycle_atomic_v1(uuid, uuid, text, text, bigint)
  to service_role;

comment on table public.currencies is
  'Server-managed currency reference data. Browser access is mediated through trusted Backend routes.';
comment on table public.game_lifecycle_transition_requests is
  'Server-managed idempotency and immutable lifecycle transition evidence. Direct browser access is denied.';

commit;
