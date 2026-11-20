-- Business V2 Phase 12: preserve the canonical Stockroom read contract after
-- inventory_holdings became the shared economic-asset projection.
--
-- The public Stockroom RPC declares quantity fields as numeric. The canonical
-- inventory_holdings projection retains integer quantity columns for legacy
-- compatibility, so PL/pgSQL RETURN QUERY must cast those fields explicitly.
-- This migration changes no inventory authority and performs no mutation from
-- the Player read path.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

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
    holding.quantity_owned::numeric,
    holding.quantity_reserved::numeric,
    greatest(holding.quantity_owned - holding.quantity_reserved, 0)::numeric,
    holding.average_unit_cost::numeric,
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

comment on function public.read_owned_business_stockroom_v2(uuid, uuid) is
  'Returns canonical Business holdings across Warehouse, WIP, Finished Goods, and In Transit with public keys and numeric public quantity fields only.';

revoke all on function public.read_owned_business_stockroom_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.read_owned_business_stockroom_v2(uuid, uuid)
  to service_role;

commit;
