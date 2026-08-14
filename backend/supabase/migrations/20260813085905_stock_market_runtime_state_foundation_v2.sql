create table if not exists private.stock_market_runtime_state (
  game_session_id uuid primary key references public.game_sessions(id) on delete cascade,
  engine_version text not null default 'stock-market-runner-v1' check (length(btrim(engine_version)) > 0),
  simulation_seed text not null check (length(btrim(simulation_seed)) > 0),
  current_tick_index integer not null default 0 check (current_tick_index >= 0),
  last_tick_at timestamptz,
  runtime_mode text not null default 'active' check (runtime_mode in ('active','idle','suspended')),
  last_player_activity_at timestamptz,
  next_due_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table private.stock_market_runtime_state enable row level security;
alter table private.stock_market_runtime_state force row level security;
revoke all on private.stock_market_runtime_state from public, anon, authenticated;
grant select, insert, update on private.stock_market_runtime_state to service_role;

insert into private.stock_market_runtime_state (
  game_session_id,
  engine_version,
  simulation_seed,
  current_tick_index,
  last_tick_at,
  runtime_mode,
  next_due_at
)
select
  g.id,
  'stock-market-runner-v1',
  'stock-market-runner-v1:' || g.id::text,
  greatest(
    coalesce((select max(t.tick_index) from public.stock_price_ticks t where t.game_session_id = g.id), 0),
    coalesce((select s.last_archived_tick_index from private.stock_tick_archive_state s where s.game_session_id = g.id), 0)
  ),
  (select max(t.created_at) from public.stock_price_ticks t where t.game_session_id = g.id),
  case
    when g.status = 'active' and g.lifecycle_state = 'active' and g.provisioning_status = 'ready' then 'active'
    else 'suspended'
  end,
  case
    when g.status = 'active' and g.lifecycle_state = 'active' and g.provisioning_status = 'ready' then clock_timestamp()
    else null
  end
from public.game_sessions g
on conflict (game_session_id) do nothing;

create or replace function private.advance_stock_market_runtime_cursor_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  insert into private.stock_market_runtime_state (
    game_session_id,
    engine_version,
    simulation_seed,
    current_tick_index,
    last_tick_at,
    runtime_mode,
    next_due_at,
    updated_at
  )
  select
    i.game_session_id,
    'stock-market-runner-v1',
    'stock-market-runner-v1:' || i.game_session_id::text,
    max(i.tick_index),
    max(i.created_at),
    'active',
    max(i.created_at) + interval '1 minute',
    clock_timestamp()
  from inserted_stock_ticks i
  group by i.game_session_id
  on conflict (game_session_id) do update
  set current_tick_index = greatest(private.stock_market_runtime_state.current_tick_index, excluded.current_tick_index),
      last_tick_at = case
        when private.stock_market_runtime_state.last_tick_at is null then excluded.last_tick_at
        when excluded.last_tick_at is null then private.stock_market_runtime_state.last_tick_at
        else greatest(private.stock_market_runtime_state.last_tick_at, excluded.last_tick_at)
      end,
      next_due_at = excluded.next_due_at,
      updated_at = clock_timestamp();
  return null;
end;
$$;

revoke all on function private.advance_stock_market_runtime_cursor_v2() from public, anon, authenticated, service_role;

drop trigger if exists stock_price_ticks_advance_runtime_cursor_v2 on public.stock_price_ticks;
create trigger stock_price_ticks_advance_runtime_cursor_v2
after insert on public.stock_price_ticks
referencing new table as inserted_stock_ticks
for each statement
execute function private.advance_stock_market_runtime_cursor_v2();

create or replace function public.get_next_stock_market_tick_index(p_game_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select greatest(
    coalesce((
      select r.current_tick_index
      from private.stock_market_runtime_state r
      where r.game_session_id = p_game_session_id
    ), 0),
    coalesce((
      select max(t.tick_index)
      from public.stock_price_ticks t
      where t.game_session_id = p_game_session_id
    ), 0),
    coalesce((
      select s.last_archived_tick_index
      from private.stock_tick_archive_state s
      where s.game_session_id = p_game_session_id
    ), 0)
  ) + 1;
$$;

revoke all on function public.get_next_stock_market_tick_index(uuid) from public, anon, authenticated;
grant execute on function public.get_next_stock_market_tick_index(uuid) to service_role;

create or replace function public.get_stock_market_runtime_state_v2(p_game_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select jsonb_build_object(
    'gameSessionId', r.game_session_id,
    'engineVersion', r.engine_version,
    'simulationSeed', r.simulation_seed,
    'currentTickIndex', r.current_tick_index,
    'lastTickAt', r.last_tick_at,
    'runtimeMode', r.runtime_mode,
    'lastPlayerActivityAt', r.last_player_activity_at,
    'nextDueAt', r.next_due_at,
    'updatedAt', r.updated_at
  )
  from private.stock_market_runtime_state r
  where r.game_session_id = p_game_session_id;
$$;

revoke all on function public.get_stock_market_runtime_state_v2(uuid) from public, anon, authenticated;
grant execute on function public.get_stock_market_runtime_state_v2(uuid) to service_role;

comment on table private.stock_market_runtime_state is
  'Authoritative Stock Runtime V2 cursor and engine identity. Decouples deterministic simulation progress from raw tick retention.';
comment on function public.get_next_stock_market_tick_index(uuid) is
  'Returns the next stock simulation tick from the authoritative runtime cursor, hot ticks, or cold-archive cursor, whichever is furthest advanced.';
