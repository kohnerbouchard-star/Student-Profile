-- Business V2 Phase 3C: location-complete canonical Stockroom authority.
--
-- Business Stockroom locations are canonical inventory accounts owned by the
-- Business economic party. This migration adds no Business inventory table or
-- projection and performs no mutation from a browser read.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function economy_private.ensure_business_inventory_account_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_account_kind text
)
returns uuid
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_account_kind text := lower(btrim(coalesce(p_account_kind, '')));
  v_party_id uuid;
  v_account_id uuid;
begin
  if v_account_kind not in (
    'warehouse',
    'work_in_progress',
    'finished_goods',
    'in_transit'
  ) then
    raise exception 'ECONOMIC_CORE_BUSINESS_ACCOUNT_KIND_INVALID'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.business_entities as business_row
    where business_row.game_session_id = p_game_session_id
      and business_row.id = p_business_id
  ) then
    raise exception 'ECONOMIC_CORE_BUSINESS_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  insert into public.economic_parties(
    game_session_id,
    party_kind,
    business_id,
    status
  ) values (
    p_game_session_id,
    'business',
    p_business_id,
    'active'
  )
  on conflict (game_session_id, business_id) where business_id is not null
  do update set status = case
    when public.economic_parties.status = 'closed' then 'closed'
    else 'active'
  end
  returning id into v_party_id;

  insert into public.inventory_accounts(
    game_session_id,
    party_id,
    account_kind,
    location_key,
    status
  ) values (
    p_game_session_id,
    v_party_id,
    v_account_kind,
    null,
    'active'
  )
  on conflict (
    game_session_id,
    party_id,
    account_kind,
    (coalesce(location_key, ''))
  ) do update set status = case
    when public.inventory_accounts.status = 'closed' then 'closed'
    else 'active'
  end
  returning id into v_account_id;

  return v_account_id;
end
$function$;

create or replace function economy_private.ensure_business_stockroom_accounts_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_account_kind text;
begin
  foreach v_account_kind in array array[
    'warehouse',
    'work_in_progress',
    'finished_goods',
    'in_transit'
  ]::text[]
  loop
    perform economy_private.ensure_business_inventory_account_v2(
      p_game_session_id,
      p_business_id,
      v_account_kind
    );
  end loop;
end
$function$;

create or replace function economy_private.provision_business_stockroom_accounts_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  if new.status <> 'closed' then
    perform economy_private.ensure_business_stockroom_accounts_v2(
      new.game_session_id,
      new.id
    );
  end if;
  return new;
end
$function$;

drop trigger if exists provision_business_stockroom_accounts_v2
  on public.business_entities;
create trigger provision_business_stockroom_accounts_v2
after insert on public.business_entities
for each row execute function economy_private.provision_business_stockroom_accounts_v2();

-- Existing Businesses receive all four canonical locations during migration.
do $backfill$
declare
  v_business record;
begin
  for v_business in
    select business_row.game_session_id, business_row.id
    from public.business_entities as business_row
    where business_row.status <> 'closed'
    order by business_row.game_session_id, business_row.id
  loop
    perform economy_private.ensure_business_stockroom_accounts_v2(
      v_business.game_session_id,
      v_business.id
    );
  end loop;
end
$backfill$;

create or replace function public.read_owned_business_stockroom_locations_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns table (
  business_key text,
  account_key text,
  location_key text,
  location_label text,
  item_count bigint,
  quantity_owned numeric,
  quantity_reserved numeric,
  quantity_available numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business record;
begin
  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  return query
  select
    v_business.business_key,
    account.public_key,
    account.account_kind,
    case account.account_kind
      when 'warehouse' then 'Warehouse / Materials'
      when 'work_in_progress' then 'Work in Progress'
      when 'finished_goods' then 'Finished Goods'
      when 'in_transit' then 'In Transit'
    end,
    count(item.id)::bigint,
    coalesce(sum(
      case when item.id is not null then holding.quantity_owned else 0 end
    ), 0)::numeric,
    coalesce(sum(
      case when item.id is not null then holding.quantity_reserved else 0 end
    ), 0)::numeric,
    coalesce(sum(
      case when item.id is not null
        then greatest(holding.quantity_owned - holding.quantity_reserved, 0)
        else 0
      end
    ), 0)::numeric
  from public.economic_parties as party
  join public.inventory_accounts as account
    on account.game_session_id = party.game_session_id
   and account.party_id = party.id
   and account.account_kind in (
     'warehouse',
     'work_in_progress',
     'finished_goods',
     'in_transit'
   )
   and account.status = 'active'
   and account.location_key is null
  left join public.inventory_holdings as holding
    on holding.game_session_id = account.game_session_id
   and holding.inventory_account_id = account.id
   and holding.quantity_owned > 0
  left join public.game_items as item
    on item.game_session_id = holding.game_session_id
   and item.id = holding.game_item_id
   and item.status = 'active'
  where party.game_session_id = p_game_session_id
    and party.party_kind = 'business'
    and party.business_id = v_business.business_id
    and party.status = 'active'
  group by
    v_business.business_key,
    account.public_key,
    account.account_kind
  order by case account.account_kind
    when 'warehouse' then 1
    when 'work_in_progress' then 2
    when 'finished_goods' then 3
    when 'in_transit' then 4
    else 5
  end;
end
$function$;

create or replace function public.read_owned_business_stockroom_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns table (
  business_key text,
  account_key text,
  location_key text,
  item_key text,
  canonical_key text,
  item_name text,
  item_class text,
  item_subtype text,
  quantity_owned numeric,
  quantity_reserved numeric,
  quantity_available numeric,
  average_unit_cost numeric,
  cost_currency_code text,
  holding_version bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business record;
begin
  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  return query
  select
    v_business.business_key,
    account.public_key,
    account.account_kind,
    item.public_key,
    item.canonical_key,
    item.name,
    item.item_class,
    item.subtype,
    holding.quantity_owned,
    holding.quantity_reserved,
    greatest(holding.quantity_owned - holding.quantity_reserved, 0),
    holding.average_unit_cost,
    holding.cost_currency_code,
    holding.version
  from public.economic_parties as party
  join public.inventory_accounts as account
    on account.game_session_id = party.game_session_id
   and account.party_id = party.id
   and account.account_kind in (
     'warehouse',
     'work_in_progress',
     'finished_goods',
     'in_transit'
   )
   and account.status = 'active'
   and account.location_key is null
  join public.inventory_holdings as holding
    on holding.game_session_id = account.game_session_id
   and holding.inventory_account_id = account.id
  join public.game_items as item
    on item.game_session_id = holding.game_session_id
   and item.id = holding.game_item_id
  where party.game_session_id = p_game_session_id
    and party.party_kind = 'business'
    and party.business_id = v_business.business_id
    and party.status = 'active'
    and holding.quantity_owned > 0
    and item.status = 'active'
  order by
    case account.account_kind
      when 'warehouse' then 1
      when 'work_in_progress' then 2
      when 'finished_goods' then 3
      when 'in_transit' then 4
      else 5
    end,
    item.item_class,
    item.name,
    item.canonical_key;
end
$function$;

comment on function public.read_owned_business_stockroom_locations_v2(uuid, uuid) is
  'Returns exactly the active canonical Business Stockroom locations and bounded aggregate quantities without internal UUIDs.';
comment on function public.read_owned_business_stockroom_v2(uuid, uuid) is
  'Returns canonical Business holdings across Warehouse, WIP, Finished Goods, and In Transit with public keys only.';

revoke all on function economy_private.ensure_business_inventory_account_v2(
  uuid,
  uuid,
  text
) from public, anon, authenticated;
revoke all on function economy_private.ensure_business_stockroom_accounts_v2(
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function economy_private.provision_business_stockroom_accounts_v2()
  from public, anon, authenticated;
revoke all on function public.read_owned_business_stockroom_locations_v2(
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function public.read_owned_business_stockroom_v2(
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function economy_private.ensure_business_inventory_account_v2(
  uuid,
  uuid,
  text
) to service_role;
grant execute on function economy_private.ensure_business_stockroom_accounts_v2(
  uuid,
  uuid
) to service_role;
grant execute on function public.read_owned_business_stockroom_locations_v2(
  uuid,
  uuid
) to service_role;
grant execute on function public.read_owned_business_stockroom_v2(
  uuid,
  uuid
) to service_role;

commit;
