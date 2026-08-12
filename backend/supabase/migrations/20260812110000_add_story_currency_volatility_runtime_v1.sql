begin;

create or replace function public.apply_story_currency_volatility_v1(
  p_game_session_id uuid,
  p_command_key text,
  p_adjustments_basis_points jsonb,
  p_effective_at timestamptz default clock_timestamp()
)
returns table (
  command_outcome text,
  inserted_rates integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_source text;
  v_inserted integer := 0;
  v_existing integer := 0;
  v_invalid integer := 0;
  v_pair_count integer := 0;
begin
  if p_game_session_id is null
    or p_command_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$'
    or jsonb_typeof(p_adjustments_basis_points) <> 'object'
    or p_effective_at is null
  then
    raise exception 'STORY_CURRENCY_VOLATILITY_REQUEST_INVALID' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.status in ('active', 'paused')
  ) then
    raise exception 'STORY_CURRENCY_VOLATILITY_GAME_NOT_MUTABLE' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_invalid
  from jsonb_each_text(p_adjustments_basis_points) as adjustment(currency_code, basis_points)
  where adjustment.currency_code not in (
      'NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV'
    )
    or adjustment.basis_points !~ '^-?[0-9]+$'
    or adjustment.basis_points::integer not between -1500 and 1500;

  if v_invalid <> 0 then
    raise exception 'STORY_CURRENCY_VOLATILITY_ADJUSTMENT_INVALID' using errcode = '22023';
  end if;

  if coalesce((p_adjustments_basis_points ->> 'VAL')::integer, 0) <> 0 then
    raise exception 'STORY_CURRENCY_VOLATILITY_VAL_NUMERAIRE_REQUIRED' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from jsonb_each_text(p_adjustments_basis_points) as adjustment(currency_code, basis_points)
    where adjustment.basis_points::integer <> 0
  ) then
    raise exception 'STORY_CURRENCY_VOLATILITY_NONZERO_ADJUSTMENT_REQUIRED' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_game_session_id::text, 2608121100));

  v_source := 'story-fx:' || p_command_key;

  select count(*)::integer
  into v_existing
  from public.currency_exchange_rates as existing_rate
  where existing_rate.game_session_id = p_game_session_id
    and existing_rate.source = v_source;

  if v_existing > 0 then
    if v_existing <> 90 then
      raise exception 'STORY_CURRENCY_VOLATILITY_REPLAY_INCOMPLETE' using errcode = 'P0001';
    end if;
    return query select 'replayed'::text, 0;
    return;
  end if;

  with latest_rates as (
    select distinct on (
      rate_row.from_currency_code,
      rate_row.to_currency_code
    )
      rate_row.from_currency_code,
      rate_row.to_currency_code,
      rate_row.rate
    from public.currency_exchange_rates as rate_row
    where rate_row.game_session_id = p_game_session_id
      and rate_row.from_currency_code in ('NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV')
      and rate_row.to_currency_code in ('NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV')
      and rate_row.from_currency_code <> rate_row.to_currency_code
      and rate_row.effective_at <= p_effective_at
      and (rate_row.expires_at is null or rate_row.expires_at > p_effective_at)
    order by
      rate_row.from_currency_code,
      rate_row.to_currency_code,
      rate_row.effective_at desc,
      rate_row.created_at desc,
      rate_row.id desc
  )
  select count(*)::integer
  into v_pair_count
  from latest_rates;

  if v_pair_count <> 90 then
    raise exception 'STORY_CURRENCY_VOLATILITY_FX_MATRIX_INCOMPLETE' using errcode = 'P0001';
  end if;

  with latest_rates as (
    select distinct on (
      rate_row.from_currency_code,
      rate_row.to_currency_code
    )
      rate_row.from_currency_code,
      rate_row.to_currency_code,
      rate_row.rate
    from public.currency_exchange_rates as rate_row
    where rate_row.game_session_id = p_game_session_id
      and rate_row.from_currency_code in ('NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV')
      and rate_row.to_currency_code in ('NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV')
      and rate_row.from_currency_code <> rate_row.to_currency_code
      and rate_row.effective_at <= p_effective_at
      and (rate_row.expires_at is null or rate_row.expires_at > p_effective_at)
    order by
      rate_row.from_currency_code,
      rate_row.to_currency_code,
      rate_row.effective_at desc,
      rate_row.created_at desc,
      rate_row.id desc
  ), adjusted as (
    select
      latest.from_currency_code,
      latest.to_currency_code,
      round(
        latest.rate
        * (1 + coalesce((p_adjustments_basis_points ->> latest.to_currency_code)::numeric, 0) / 10000)
        / (1 + coalesce((p_adjustments_basis_points ->> latest.from_currency_code)::numeric, 0) / 10000),
        8
      ) as rate
    from latest_rates as latest
  )
  insert into public.currency_exchange_rates (
    game_session_id,
    from_currency_code,
    to_currency_code,
    rate,
    source,
    effective_at,
    expires_at
  )
  select
    p_game_session_id,
    adjusted.from_currency_code,
    adjusted.to_currency_code,
    adjusted.rate,
    v_source,
    p_effective_at,
    null
  from adjusted
  order by adjusted.from_currency_code, adjusted.to_currency_code;

  get diagnostics v_inserted = row_count;

  if v_inserted <> 90 then
    raise exception 'STORY_CURRENCY_VOLATILITY_WRITE_INCOMPLETE' using errcode = 'P0001';
  end if;

  return query select 'applied'::text, v_inserted;
end;
$function$;

revoke all on function public.apply_story_currency_volatility_v1(uuid, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_story_currency_volatility_v1(uuid, text, jsonb, timestamptz)
  to service_role;

comment on function public.apply_story_currency_volatility_v1(uuid, text, jsonb, timestamptz) is
  'Applies an idempotent, session-scoped Story FX shock by appending a coherent 90-direction rate matrix. Signed currency adjustments are bounded to +/-1500 basis points and VAL remains the zero-adjustment numeraire.';

notify pgrst, 'reload schema';

commit;
