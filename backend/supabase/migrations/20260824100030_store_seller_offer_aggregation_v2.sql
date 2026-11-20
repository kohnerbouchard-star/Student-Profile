-- Business V2 Phase 7A: canonical multi-offer catalog aggregation read.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.read_store_catalog_offer_groups_v2(
  p_game_session_id uuid
)
returns table(
  catalog_item_key text,
  canonical_item_key text,
  store_item_key text,
  name text,
  description text,
  category text,
  currency_code text,
  best_unit_price numeric,
  total_available_quantity integer,
  seller_count integer,
  offer_count integer,
  offers jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  with offer_rows as (
    select
      offer.id as offer_id,
      offer.public_key as offer_key,
      offer.game_item_id,
      offer.seller_party_id,
      offer.seller_kind,
      offer.unit_price,
      offer.currency_code,
      offer.status,
      offer.version,
      offer.updated_at as offer_updated_at,
      item.item_key as store_item_key,
      item.name,
      item.description,
      item.category,
      item.sort_order,
      item.updated_at as store_item_updated_at,
      game_item.public_key as catalog_item_key,
      game_item.canonical_key as canonical_item_key,
      game_item.updated_at as game_item_updated_at,
      party.public_key as seller_key,
      case
        when offer.seller_kind = 'business' then business.legal_name
        when offer.seller_kind = 'seeded' then 'Econovaria Store'
        else coalesce(nullif(party.system_key, ''), 'NPC seller')
      end as seller_name,
      greatest(
        floor(
          coalesce(holding.quantity_owned, 0)
          - coalesce(holding.quantity_reserved, 0)
        ),
        0
      )::integer as available_quantity
    from public.store_seller_offers as offer
    join public.store_items as item
      on item.game_session_id = offer.game_session_id
     and item.id = offer.store_item_id
     and item.status = 'active'
     and item.visibility = 'visible'
    join public.game_items as game_item
      on game_item.game_session_id = offer.game_session_id
     and game_item.id = offer.game_item_id
     and game_item.status = 'active'
    join public.economic_parties as party
      on party.game_session_id = offer.game_session_id
     and party.id = offer.seller_party_id
     and party.status = 'active'
    join public.inventory_accounts as account
      on account.game_session_id = offer.game_session_id
     and account.id = offer.inventory_account_id
     and account.party_id = offer.seller_party_id
     and account.account_kind = 'store_stock'
     and account.status = 'active'
    left join public.inventory_holdings as holding
      on holding.game_session_id = offer.game_session_id
     and holding.inventory_account_id = account.id
     and holding.game_item_id = offer.game_item_id
    left join public.business_entities as business
      on business.game_session_id = party.game_session_id
     and business.id = party.business_id
    where offer.game_session_id = p_game_session_id
      and offer.status = 'active'
  ),
  ranked as (
    select
      row_value.*,
      row_number() over (
        partition by row_value.game_item_id
        order by
          row_value.sort_order,
          row_value.store_item_key,
          row_value.offer_key
      ) as presentation_rank
    from offer_rows as row_value
  )
  select
    max(ranked.catalog_item_key) filter (where ranked.presentation_rank = 1),
    max(ranked.canonical_item_key) filter (where ranked.presentation_rank = 1),
    max(ranked.store_item_key) filter (where ranked.presentation_rank = 1),
    max(ranked.name) filter (where ranked.presentation_rank = 1),
    max(ranked.description) filter (where ranked.presentation_rank = 1),
    max(ranked.category) filter (where ranked.presentation_rank = 1),
    max(ranked.currency_code) filter (where ranked.presentation_rank = 1),
    min(ranked.unit_price) filter (where ranked.available_quantity > 0),
    coalesce(sum(ranked.available_quantity), 0)::integer,
    (count(distinct ranked.seller_party_id)
      filter (where ranked.available_quantity > 0))::integer,
    count(*)::integer,
    jsonb_agg(
      jsonb_build_object(
        'offerKey', ranked.offer_key,
        'sellerKey', ranked.seller_key,
        'sellerKind', ranked.seller_kind,
        'sellerName', ranked.seller_name,
        'unitPrice', ranked.unit_price,
        'currencyCode', ranked.currency_code,
        'availableQuantity', ranked.available_quantity,
        'status', ranked.status,
        'version', ranked.version
      )
      order by
        case when ranked.available_quantity > 0 then 0 else 1 end,
        ranked.unit_price,
        ranked.seller_kind,
        ranked.offer_key
    ),
    max(greatest(
      ranked.offer_updated_at,
      ranked.store_item_updated_at,
      ranked.game_item_updated_at
    ))
  from ranked
  group by ranked.game_item_id
  order by
    min(ranked.sort_order),
    max(ranked.name) filter (where ranked.presentation_rank = 1),
    max(ranked.canonical_item_key) filter (where ranked.presentation_rank = 1)
$function$;

revoke all on function public.read_store_catalog_offer_groups_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.read_store_catalog_offer_groups_v2(uuid)
  to service_role;

commit;
