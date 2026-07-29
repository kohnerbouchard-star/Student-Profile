begin;

-- The deployed Admin bootstrap projects the persisted readable Game Code.
-- Production predates that nullable column even though the handler is live.
-- Keep this repair additive and row-preserving; existing games remain null.
alter table public.game_sessions
  add column if not exists game_join_code text null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.game_sessions'::regclass
      and conname = 'game_sessions_readable_join_code_valid'
  ) then
    alter table public.game_sessions
      add constraint game_sessions_readable_join_code_valid check (
        game_join_code is null
        or game_join_code ~ '^ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}$'
      );
  end if;
end;
$migration$;

create unique index if not exists game_sessions_active_readable_join_code_unique
  on public.game_sessions (game_join_code)
  where game_join_code is not null
    and game_join_code_status = 'active';

comment on column public.game_sessions.game_join_code is
  'Current readable multiplayer Game Code. This is a public room identifier and is persisted for staff display; Player ID and Player Access Code remain the authentication credentials.';

commit;
