-- Phase 5 prerequisite: give production runs a game-scoped referenced key before
-- Business equipment reservations bind to exact production evidence.

begin;

create unique index if not exists business_production_runs_scope_id_unique
  on public.business_production_runs(game_session_id, id);

commit;
