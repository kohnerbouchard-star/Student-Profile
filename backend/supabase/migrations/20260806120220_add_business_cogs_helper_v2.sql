-- Canonical finished-goods consumption and COGS helper V2.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function economy_private.consume_business_finished_inventory_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_settlement_key text
)
returns numeric
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_product public.business_products%rowtype;
  v_inventory public.business_inventory%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_sink_account_id uuid;
  v_cogs numeric;
  v_post jsonb;
begin
  if p_quantity is null
    or p_quantity <= 0
    or length(btrim(coalesce(p_settlement_key, ''))) not between 1 and 160
  then
    raise exception 'BUSINESS_FINISHED_INVENTORY_CONSUMPTION_INVALID' using errcode = 'P0001';
  end if;

  select be.* into v_business
  from public.business_entities be
  where be.game_session_id = p_game_session_id
    and be.id = p_business_id
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select bp.* into v_product
  from public.business_products bp
  where bp.game_session_id = p_game_session_id
    and bp.business_id = p_business_id
    and bp.id = p_product_id
  for share;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_product.product_kind = 'service' then
    return 0;
  end if;

  if v_product.product_kind = 'physical_good' then
    select bi.* into v_inventory
    from public.business_inventory bi
    where bi.game_session_id = p_game_session_id
      and bi.business_id = p_business_id
      and bi.game_item_id = v_product.output_game_item_id
      and bi.inventory_kind = 'finished_good'
    for update;
  else
    select bi.* into v_inventory
    from public.business_inventory bi
    where bi.game_session_id = p_game_session_id
      and bi.business_id = p_business_id
      and bi.item_key = 'finished:' || v_product.public_key
      and bi.inventory_kind = 'finished_good'
    for update;
  end if;

  if not found or v_inventory.quantity < p_quantity then
    raise exception 'BUSINESS_FINISHED_INVENTORY_UNAVAILABLE:%', v_product.public_key using errcode = 'P0001';
  end if;
  if v_inventory.inventory_account_id is null or v_inventory.game_item_id is null then
    raise exception 'BUSINESS_FINISHED_INVENTORY_CONTEXT_MISSING:%', v_product.public_key using errcode = 'P0001';
  end if;

  select h.* into v_holding
  from public.inventory_holdings h
  where h.game_session_id = p_game_session_id
    and h.inventory_account_id = v_inventory.inventory_account_id
    and h.game_item_id = v_inventory.game_item_id
  for update;
  if not found or v_holding.quantity_owned < p_quantity then
    raise exception 'BUSINESS_FINISHED_INVENTORY_PROJECTION_INVALID:%', v_product.public_key using errcode = 'P0001';
  end if;

  v_cogs := round(p_quantity * v_holding.average_unit_cost, 2);
  v_sink_account_id := economy_private.ensure_system_inventory_account_v2(
    p_game_session_id,
    'system',
    'business.sink',
    'system_sink',
    null
  );

  v_post := economy_private.post_inventory_transaction_v2(
    p_game_session_id,
    'sale',
    'business',
    'sale_settled',
    p_product_id,
    p_settlement_key || ':' || p_product_id::text,
    jsonb_build_object(
      'businessKey', v_business.public_key,
      'productKey', v_product.public_key,
      'quantity', p_quantity,
      'costOfGoodsSold', v_cogs
    ),
    jsonb_build_array(
      jsonb_build_object(
        'inventoryAccountId', v_inventory.inventory_account_id,
        'gameItemId', v_inventory.game_item_id,
        'quantityDelta', -p_quantity,
        'reservationDelta', 0,
        'unitCost', v_holding.average_unit_cost,
        'currencyCode', coalesce(v_holding.cost_currency_code, v_business.currency_code),
        'metadata', jsonb_build_object('side', 'business_finished_goods')
      ),
      jsonb_build_object(
        'inventoryAccountId', v_sink_account_id,
        'gameItemId', v_inventory.game_item_id,
        'quantityDelta', p_quantity,
        'reservationDelta', 0,
        'unitCost', v_holding.average_unit_cost,
        'currencyCode', coalesce(v_holding.cost_currency_code, v_business.currency_code),
        'metadata', jsonb_build_object('side', 'business_sale_sink')
      )
    )
  );

  select h.* into v_holding
  from public.inventory_holdings h
  where h.game_session_id = p_game_session_id
    and h.inventory_account_id = v_inventory.inventory_account_id
    and h.game_item_id = v_inventory.game_item_id;

  update public.business_inventory
  set
    quantity = v_holding.quantity_owned,
    unit_cost = v_holding.average_unit_cost,
    total_cost_basis = round(v_holding.quantity_owned * v_holding.average_unit_cost, 4),
    version = version + 1,
    updated_at = now()
  where id = v_inventory.id;

  return v_cogs;
end
$function$;

revoke all on function economy_private.consume_business_finished_inventory_v2(
  uuid, uuid, uuid, integer, text
) from public, anon, authenticated;
grant execute on function economy_private.consume_business_finished_inventory_v2(
  uuid, uuid, uuid, integer, text
) to service_role;

commit;
