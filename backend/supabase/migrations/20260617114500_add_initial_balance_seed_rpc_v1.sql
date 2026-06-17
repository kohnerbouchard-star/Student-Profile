-- Initial balance seeding RPC V1.
-- Seeds active players that do not already have an account balance row
-- for the requested account/currency. Uses record_player_ledger_entry(...)
-- so ledger_entries remains the source of truth.

create or replace function public.seed_initial_player_balances(
  p_game_session_id uuid,
  p_amount numeric,
  p_account_type text default 'cash',
  p_currency_code text default 'ECO',
  p_created_by_id uuid default null,
  p_reason text default 'Initial balance seed',
  p_request_id text default null
)
returns table (
  created_count integer,
  skipped_count integer,
  account_type text,
  currency_code text,
  seed_amount numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player record;
  v_game_exists boolean;
  v_balance_exists boolean;
  v_created_count integer := 0;
  v_skipped_count integer := 0;
  v_account_type text := btrim(coalesce(p_account_type, 'cash'));
  v_currency_code text := upper(btrim(coalesce(p_currency_code, 'ECO')));
  v_reason text := btrim(coalesce(p_reason, 'Initial balance seed'));
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED'
      using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.game_sessions
    where id = p_game_session_id
      and status = 'active'
  )
  into v_game_exists;

  if not v_game_exists then
    raise exception 'GAME_SESSION_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'SEED_AMOUNT_REQUIRED'
      using errcode = 'P0001';
  end if;

  if length(v_account_type) = 0 then
    raise exception 'ACCOUNT_TYPE_REQUIRED'
      using errcode = 'P0001';
  end if;

  if length(v_currency_code) < 3 or length(v_currency_code) > 16 then
    raise exception 'INVALID_CURRENCY_CODE'
      using errcode = 'P0001';
  end if;

  if length(v_reason) = 0 then
    v_reason := 'Initial balance seed';
  end if;

  for v_player in
    select id
    from public.players
    where game_session_id = p_game_session_id
      and status = 'active'
    order by created_at asc
  loop
    select exists (
      select 1
      from public.account_balances
      where game_session_id = p_game_session_id
        and player_id = v_player.id
        and account_type = v_account_type
        and currency_code = v_currency_code
    )
    into v_balance_exists;

    if v_balance_exists then
      v_skipped_count := v_skipped_count + 1;
    else
      perform 1
      from public.record_player_ledger_entry(
        p_game_session_id,
        v_player.id,
        v_account_type,
        p_amount,
        v_currency_code,
        'credit',
        'setup',
        'initial_balance_seed',
        null,
        'staff_user',
        p_created_by_id,
        jsonb_build_object(
          'requestId', p_request_id,
          'reason', v_reason,
          'source', 'classroom_api_edge_initial_balance_seed'
        )
      );

      v_created_count := v_created_count + 1;
    end if;
  end loop;

  return query
  select
    v_created_count,
    v_skipped_count,
    v_account_type,
    v_currency_code,
    p_amount,
    now();
end;
$$;

comment on function public.seed_initial_player_balances(
  uuid,
  numeric,
  text,
  text,
  uuid,
  text,
  text
) is
  'Seeds active players with an initial balance only when they do not already have a matching balance row.';

revoke all on function public.seed_initial_player_balances(
  uuid,
  numeric,
  text,
  text,
  uuid,
  text,
  text
) from public;

grant execute on function public.seed_initial_player_balances(
  uuid,
  numeric,
  text,
  text,
  uuid,
  text,
  text
) to service_role;
