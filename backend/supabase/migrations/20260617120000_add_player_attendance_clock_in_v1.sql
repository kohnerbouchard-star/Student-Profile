-- Player attendance clock-in V1.
-- The Edge route computes attendance_date/status from game_settings.attendance_window.
-- This RPC only records the server-approved attendance result.

create table if not exists public.player_attendance_records (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  attendance_date date not null,
  status text not null default 'present',
  clocked_in_at timestamptz not null default now(),
  source text not null default 'player_clock_in',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint player_attendance_records_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint player_attendance_records_scope_unique
    unique (game_session_id, player_id, attendance_date),
  constraint player_attendance_records_status_check
    check (status in ('present', 'late')),
  constraint player_attendance_records_source_not_blank
    check (length(btrim(source)) > 0)
);

create trigger set_player_attendance_records_updated_at
before update on public.player_attendance_records
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.player_attendance_records is
  'One attendance clock-in record per active player per game day.';
comment on column public.player_attendance_records.attendance_date is
  'Classroom attendance date computed by the Edge route from game settings timezone.';

create index player_attendance_records_game_date_idx
on public.player_attendance_records (game_session_id, attendance_date desc);

create index player_attendance_records_player_date_idx
on public.player_attendance_records (player_id, attendance_date desc);

create or replace function public.record_player_attendance_clock_in(
  p_game_session_id uuid,
  p_player_id uuid,
  p_attendance_date date,
  p_status text default 'present',
  p_reward_amount numeric default 0,
  p_currency_code text default 'ECO',
  p_request_id text default null
)
returns table (
  attendance_id uuid,
  attendance_status text,
  attendance_date date,
  clocked_in_at timestamptz,
  was_created boolean,
  ledger_entry_id uuid,
  reward_amount numeric,
  currency_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player public.players%rowtype;
  v_attendance public.player_attendance_records%rowtype;
  v_existing public.player_attendance_records%rowtype;
  v_ledger_entry_id uuid := null;
  v_status text := btrim(coalesce(p_status, 'present'));
  v_currency_code text := upper(btrim(coalesce(p_currency_code, 'ECO')));
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_player_id is null then
    raise exception 'PLAYER_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_attendance_date is null then
    raise exception 'ATTENDANCE_DATE_REQUIRED'
      using errcode = 'P0001';
  end if;

  if v_status not in ('present', 'late') then
    raise exception 'INVALID_ATTENDANCE_STATUS'
      using errcode = 'P0001';
  end if;

  if p_reward_amount is null or p_reward_amount < 0 then
    raise exception 'INVALID_REWARD_AMOUNT'
      using errcode = 'P0001';
  end if;

  if length(v_currency_code) < 3 or length(v_currency_code) > 16 then
    raise exception 'INVALID_CURRENCY_CODE'
      using errcode = 'P0001';
  end if;

  select *
  into v_player
  from public.players
  where game_session_id = p_game_session_id
    and id = p_player_id
    and status = 'active';

  if not found then
    raise exception 'PLAYER_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  insert into public.player_attendance_records (
    game_session_id,
    player_id,
    attendance_date,
    status,
    clocked_in_at,
    source
  )
  values (
    p_game_session_id,
    p_player_id,
    p_attendance_date,
    v_status,
    now(),
    'player_clock_in'
  )
  on conflict on constraint player_attendance_records_scope_unique
  do nothing
  returning *
  into v_attendance;

  if v_attendance.id is null then
    select *
    into v_existing
    from public.player_attendance_records
    where game_session_id = p_game_session_id
      and player_id = p_player_id
      and attendance_date = p_attendance_date;

    return query
    select
      v_existing.id,
      v_existing.status,
      v_existing.attendance_date,
      v_existing.clocked_in_at,
      false,
      null::uuid,
      0::numeric,
      v_currency_code;

    return;
  end if;

  if p_reward_amount > 0 then
    select result.ledger_entry_id
    into v_ledger_entry_id
    from public.record_player_ledger_entry(
      p_game_session_id,
      p_player_id,
      'cash',
      p_reward_amount,
      v_currency_code,
      'credit',
      'attendance',
      'player_clock_in_reward',
      v_attendance.id,
      'player',
      p_player_id,
      jsonb_build_object(
        'requestId', p_request_id,
        'attendance_id', v_attendance.id,
        'attendance_date', v_attendance.attendance_date,
        'source', 'classroom_api_edge_player_attendance_clock_in'
      )
    ) as result;
  end if;

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    p_game_session_id,
    'player',
    p_player_id,
    'attendance.player_clock_in',
    'player_attendance_record',
    v_attendance.id,
    jsonb_build_object(
      'requestId', p_request_id,
      'attendance_date', v_attendance.attendance_date,
      'status', v_attendance.status,
      'reward_amount', p_reward_amount,
      'currency_code', v_currency_code,
      'ledger_entry_id', v_ledger_entry_id
    )
  );

  return query
  select
    v_attendance.id,
    v_attendance.status,
    v_attendance.attendance_date,
    v_attendance.clocked_in_at,
    true,
    v_ledger_entry_id,
    p_reward_amount,
    v_currency_code;
end;
$$;

comment on function public.record_player_attendance_clock_in(
  uuid,
  uuid,
  date,
  text,
  numeric,
  text,
  text
) is
  'Records one player clock-in per game day and optionally creates an attendance reward ledger entry.';

revoke all on function public.record_player_attendance_clock_in(
  uuid,
  uuid,
  date,
  text,
  numeric,
  text,
  text
) from public;

grant execute on function public.record_player_attendance_clock_in(
  uuid,
  uuid,
  date,
  text,
  numeric,
  text,
  text
) to service_role;
