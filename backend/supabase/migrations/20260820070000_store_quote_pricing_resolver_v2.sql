-- Canonical Store quote pricing resolver V2.
--
-- Extracts the existing Store pricing policy into one server-authoritative
-- resolver so Player Store and Business procurement quote the same catalog,
-- country snapshot, scarcity, difficulty, and FX policy.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.resolve_store_quote_pricing_v2(
  p_game_session_id uuid,
  p_store_item_id uuid,
  p_country_profile_id uuid,
  p_settlement_currency_code text,
  p_quantity integer,
  p_effective_at timestamptz default statement_timestamp()
)
returns table (
  store_item_id uuid,
  item_key text,
  item_name text,
  game_item_id uuid,
  inventory_account_id uuid,
  stock_quantity integer,
  country_profile_id uuid,
  country_code text,
  item_currency_code text,
  settlement_currency_code text,
  country_snapshot_id uuid,
  snapshot_sequence integer,
  base_unit_price numeric,
  inflation_multiplier numeric,
  location_multiplier numeric,
  scarcity_multiplier numeric,
  item_local_final_unit_price numeric,
  item_local_final_total_price numeric,
  exchange_rate numeric,
  final_unit_price numeric,
  final_total_price numeric,
  pricing_version text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_item public.store_items%rowtype;
  v_profile public.country_profiles%rowtype;
  v_snapshot public.country_economic_snapshots%rowtype;
  v_settlement_currency text := upper(btrim(coalesce(p_settlement_currency_code, '')));
  v_effective_at timestamptz := coalesce(p_effective_at, statement_timestamp());
  v_inflation_multiplier numeric;
  v_location_multiplier numeric;
  v_scarcity_multiplier numeric;
  v_item_local_unit numeric;
  v_item_local_total numeric;
  v_final_total numeric;
  v_final_unit numeric;
  v_exchange_rate numeric;
begin
  if p_game_session_id is null
    or p_store_item_id is null
    or p_country_profile_id is null
  then
    raise exception 'STORE_QUOTE_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100000 then
    raise exception 'STORE_QUOTE_QUANTITY_INVALID' using errcode = 'P0001';
  end if;
  if v_settlement_currency !~ '^[A-Z0-9_]{3,16}$' then
    raise exception 'STORE_QUOTE_CURRENCY_INVALID' using errcode = 'P0001';
  end if;

  select item_row.*
  into v_item
  from public.store_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = p_store_item_id
    and item_row.status = 'active'
    and item_row.visibility = 'visible';
  if not found then
    raise exception 'STORE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  select profile_row.*
  into v_profile
  from public.country_profiles as profile_row
  where profile_row.id = p_country_profile_id;
  if not found then
    raise exception 'COUNTRY_PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select snapshot_row.*
  into v_snapshot
  from public.country_economic_snapshots as snapshot_row
  where snapshot_row.game_session_id = p_game_session_id
    and snapshot_row.country_profile_id = p_country_profile_id
    and snapshot_row.effective_at <= v_effective_at
  order by snapshot_row.effective_at desc, snapshot_row.snapshot_sequence desc
  limit 1;
  if not found then
    raise exception 'COUNTRY_SNAPSHOT_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Preserve the established Store policy exactly: each multiplier is bounded
  -- independently from 0 to 4 before prices are rounded to currency precision.
  v_inflation_multiplier := least(greatest(1 + v_snapshot.inflation_rate, 0), 4);
  v_location_multiplier := least(greatest(
    v_snapshot.regional_price_multiplier * v_snapshot.price_difficulty_modifier,
    0
  ), 4);
  v_scarcity_multiplier := least(greatest(
    v_snapshot.supply_constraint_index * v_snapshot.scarcity_difficulty_modifier,
    0
  ), 4);

  v_item_local_unit := round(
    v_item.price
      * v_inflation_multiplier
      * v_location_multiplier
      * v_scarcity_multiplier,
    2
  );
  v_item_local_total := round(v_item_local_unit * p_quantity, 2);
  v_final_total := round(public.convert_currency_amount(
    p_game_session_id,
    v_item_local_total,
    upper(v_item.currency_code),
    v_settlement_currency
  ), 2);
  v_final_unit := case
    when p_quantity = 0 then 0
    else round(v_final_total / p_quantity, 2)
  end;
  v_exchange_rate := case
    when v_item_local_total = 0 then 1
    else round(v_final_total / v_item_local_total, 8)
  end;

  return query select
    v_item.id,
    v_item.item_key,
    v_item.name,
    v_item.game_item_id,
    v_item.inventory_account_id,
    v_item.stock_quantity,
    v_profile.id,
    v_profile.country_code,
    upper(v_item.currency_code),
    v_settlement_currency,
    v_snapshot.id,
    v_snapshot.snapshot_sequence,
    round(v_item.price, 2),
    v_inflation_multiplier,
    v_location_multiplier,
    v_scarcity_multiplier,
    v_item_local_unit,
    v_item_local_total,
    v_exchange_rate,
    v_final_unit,
    v_final_total,
    concat(
      'store-pricing-v1:country-snapshot:',
      v_snapshot.country_profile_id,
      ':',
      v_snapshot.snapshot_sequence
    ),
    v_effective_at + interval '3 minutes';
end
$function$;

comment on function public.resolve_store_quote_pricing_v2(
  uuid, uuid, uuid, text, integer, timestamptz
) is
  'Canonical Store quote price policy. Callers supply actor-owned country and settlement currency context; the resolver owns catalog, scarcity, difficulty, FX, rounding, version, and TTL.';

revoke all on function public.resolve_store_quote_pricing_v2(
  uuid, uuid, uuid, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.resolve_store_quote_pricing_v2(
  uuid, uuid, uuid, text, integer, timestamptz
) to service_role;

commit;
