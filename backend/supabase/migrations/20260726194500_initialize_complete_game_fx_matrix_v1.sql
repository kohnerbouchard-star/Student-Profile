begin;

-- Every game needs an explicit, session-scoped transaction-rate matrix before
-- Store quotes or other local-currency operations can convert values. Rates are
-- initialized from the established VAL hub baselines, then materialized as all
-- 90 directed pairs so transaction paths never require a hidden fallback.
create or replace function public.initialize_currency_exchange_rates_for_game_v1(
  p_game_session_id uuid,
  p_effective_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_inserted integer := 0;
begin
  if p_game_session_id is null or p_effective_at is null then
    raise exception 'GAME_FX_INITIALIZATION_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
  ) then
    raise exception 'GAME_FX_INITIALIZATION_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  with currency_scale (currency_code, units_per_val) as (
    values
      ('NRC'::text, 0.94000000::numeric),
      ('YRC'::text, 1.03000000::numeric),
      ('THD'::text, 1.48000000::numeric),
      ('SLV'::text, 0.78000000::numeric),
      ('ELD'::text, 1.01000000::numeric),
      ('VAL'::text, 1.00000000::numeric),
      ('LUM'::text, 1.36000000::numeric),
      ('SYN'::text, 1.12000000::numeric),
      ('XAL'::text, 1.24000000::numeric),
      ('DRV'::text, 1.61000000::numeric)
  ),
  complete_pairs as (
    select
      source.currency_code as from_currency_code,
      target.currency_code as to_currency_code,
      round(target.units_per_val / source.units_per_val, 8) as rate
    from currency_scale as source
    cross join currency_scale as target
    where source.currency_code <> target.currency_code
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
    pair_row.from_currency_code,
    pair_row.to_currency_code,
    pair_row.rate,
    'initial-game-fx-v1',
    p_effective_at,
    null
  from complete_pairs as pair_row
  where not exists (
    select 1
    from public.currency_exchange_rates as existing_rate
    where existing_rate.game_session_id = p_game_session_id
      and existing_rate.from_currency_code = pair_row.from_currency_code
      and existing_rate.to_currency_code = pair_row.to_currency_code
  );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

create or replace function public.initialize_game_fx_after_insert_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.initialize_currency_exchange_rates_for_game_v1(new.id, new.created_at);
  return new;
end;
$function$;

drop trigger if exists initialize_game_fx_after_insert
  on public.game_sessions;
create trigger initialize_game_fx_after_insert
after insert on public.game_sessions
for each row execute function public.initialize_game_fx_after_insert_v1();

-- Reconcile games created before this invariant existed. Existing explicit pair
-- rows are preserved; only missing directions are initialized.
do $backfill$
declare
  v_game record;
begin
  for v_game in
    select game_row.id, game_row.created_at
    from public.game_sessions as game_row
  loop
    perform public.initialize_currency_exchange_rates_for_game_v1(
      v_game.id,
      coalesce(v_game.created_at, now())
    );
  end loop;
end;
$backfill$;

-- Fail the migration rather than leave any game with an incomplete local FX
-- matrix. Ten currencies require 10 × 9 directed pairs.
do $verify$
begin
  if exists (
    select 1
    from public.game_sessions as game_row
    where (
      select count(distinct (rate_row.from_currency_code, rate_row.to_currency_code))
      from public.currency_exchange_rates as rate_row
      where rate_row.game_session_id = game_row.id
        and rate_row.from_currency_code in ('NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV')
        and rate_row.to_currency_code in ('NRC','YRC','THD','SLV','ELD','VAL','LUM','SYN','XAL','DRV')
        and rate_row.from_currency_code <> rate_row.to_currency_code
    ) <> 90
  ) then
    raise exception 'complete game FX matrix verification failed';
  end if;
end;
$verify$;

revoke all on function public.initialize_currency_exchange_rates_for_game_v1(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.initialize_game_fx_after_insert_v1()
  from public, anon, authenticated;
grant execute on function public.initialize_currency_exchange_rates_for_game_v1(uuid, timestamptz)
  to service_role;

comment on function public.initialize_currency_exchange_rates_for_game_v1(uuid, timestamptz) is
  'Idempotently initializes every directed pair among the ten official local currencies for one game. Existing explicit rates are preserved and missing directions receive deterministic VAL-hub-derived baselines.';
comment on table public.currency_exchange_rates is
  'Session-scoped authoritative transaction rates. New games receive a complete 90-direction local-currency matrix; later economic events may append newer effective rates.';

notify pgrst, 'reload schema';

commit;
