begin;

-- Player residency state is a durable runtime record. Restore the conventional
-- creation timestamp expected by deployed World readers while preserving the
-- existing requested/updated chronology for already-created rows.
alter table public.player_residency_states
  add column if not exists created_at timestamptz;

update public.player_residency_states
set created_at = coalesce(requested_at, updated_at, now())
where created_at is null;

alter table public.player_residency_states
  alter column created_at set default now();

alter table public.player_residency_states
  alter column created_at set not null;

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
as $function$
declare
  v_player public.players%rowtype;
  v_attendance public.player_attendance_records%rowtype;
  v_existing public.player_attendance_records%rowtype;
  v_ledger_entry_id uuid := null;
  v_status text := btrim(coalesce(p_status, 'present'));
  v_currency_code text := upper(btrim(coalesce(p_currency_code, 'ECO')));
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED' using errcode = 'P0001';
  end if;

  if p_player_id is null then
    raise exception 'PLAYER_REQUIRED' using errcode = 'P0001';
  end if;

  if p_attendance_date is null then
    raise exception 'ATTENDANCE_DATE_REQUIRED' using errcode = 'P0001';
  end if;

  if v_status not in ('present', 'late') then
    raise exception 'INVALID_ATTENDANCE_STATUS' using errcode = 'P0001';
  end if;

  if p_reward_amount is null or p_reward_amount < 0 then
    raise exception 'INVALID_REWARD_AMOUNT' using errcode = 'P0001';
  end if;

  if length(v_currency_code) < 3 or length(v_currency_code) > 16 then
    raise exception 'INVALID_CURRENCY_CODE' using errcode = 'P0001';
  end if;

  select player_row.*
  into v_player
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active';

  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
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
    select attendance_row.*
    into v_existing
    from public.player_attendance_records as attendance_row
    where attendance_row.game_session_id = p_game_session_id
      and attendance_row.player_id = p_player_id
      and attendance_row.attendance_date = p_attendance_date;

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
$function$;

revoke all on function public.record_player_attendance_clock_in(
  uuid, uuid, date, text, numeric, text, text
) from public, anon, authenticated;

grant execute on function public.record_player_attendance_clock_in(
  uuid, uuid, date, text, numeric, text, text
) to service_role;

comment on column public.player_residency_states.created_at is
  'Creation timestamp retained for World runtime compatibility and durable state chronology.';

comment on function public.record_player_attendance_clock_in(
  uuid, uuid, date, text, numeric, text, text
) is
  'Records idempotent player attendance and rewards with fully qualified duplicate lookup columns.';

commit;
