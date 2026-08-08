-- Business material-flow foundation V2.
-- Adds explicit bills of materials, canonical product outputs, player-to-business
-- inventory contribution, and capitalized legacy input procurement.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.business_sales
  add column if not exists cost_of_goods_sold numeric not null default 0;

alter table public.business_sales
  add constraint business_sales_cost_of_goods_sold_check
    check (cost_of_goods_sold >= 0);

create or replace function public.configure_business_product_material_flow_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_product_key text,
  p_product_kind text,
  p_inputs jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_product public.business_products%rowtype;
  v_output_item public.game_items%rowtype;
  v_input jsonb;
  v_input_item public.game_items%rowtype;
  v_kind text := lower(btrim(coalesce(p_product_kind, '')));
  v_output_key text;
  v_input_key text;
  v_quantity integer;
  v_waste_rate numeric;
  v_group text;
  v_existing public.audit_log%rowtype;
  v_result jsonb;
begin
  if v_kind not in ('physical_good', 'service')
    or jsonb_typeof(coalesce(p_inputs, '[]'::jsonb)) <> 'array'
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160
  then
    raise exception 'BUSINESS_MATERIAL_FLOW_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  select be.* into v_business
  from public.business_entities be
  where be.game_session_id = p_game_session_id
    and be.public_key = lower(btrim(p_business_key))
    and be.owner_player_id = p_player_id
    and be.status in ('active', 'restructuring')
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select bp.* into v_product
  from public.business_products bp
  where bp.game_session_id = p_game_session_id
    and bp.business_id = v_business.id
    and bp.public_key = lower(btrim(p_product_key))
  for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select al.* into v_existing
  from public.audit_log al
  where al.game_session_id = p_game_session_id
    and al.actor_id = p_player_id
    and al.action = 'business.product.material_flow.configure'
    and al.target_id = v_product.id
    and al.metadata ->> 'idempotency_key' = p_idempotency_key
  limit 1;
  if found then
    return coalesce(v_existing.metadata -> 'result', '{}'::jsonb)
      || jsonb_build_object('replayed', true);
  end if;

  if v_kind = 'service' then
    if jsonb_array_length(coalesce(p_inputs, '[]'::jsonb)) <> 0 then
      raise exception 'BUSINESS_SERVICE_INPUTS_NOT_ALLOWED' using errcode = 'P0001';
    end if;

    delete from public.business_product_inputs
    where game_session_id = p_game_session_id
      and business_product_id = v_product.id;
    delete from public.business_product_outputs
    where game_session_id = p_game_session_id
      and business_product_id = v_product.id;

    update public.business_products
    set
      product_kind = 'service',
      output_game_item_id = null,
      version = version + 1,
      updated_at = now()
    where id = v_product.id
    returning * into v_product;

    v_result := jsonb_build_object(
      'productKey', v_product.public_key,
      'productKind', v_product.product_kind,
      'outputItemKey', null,
      'inputs', '[]'::jsonb,
      'replayed', false
    );
  else
    if jsonb_array_length(coalesce(p_inputs, '[]'::jsonb)) = 0 then
      raise exception 'BUSINESS_PRODUCT_INPUTS_REQUIRED' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from (
        select lower(btrim(value ->> 'itemKey')) as item_key, count(*)
        from jsonb_array_elements(p_inputs)
        group by lower(btrim(value ->> 'itemKey'))
        having count(*) > 1
      ) duplicated
    ) then
      raise exception 'BUSINESS_PRODUCT_INPUT_DUPLICATE' using errcode = 'P0001';
    end if;

    v_output_key := 'business.' || v_business.public_key || '.' || v_product.public_key;

    insert into public.game_items (
      game_session_id,
      canonical_key,
      source_kind,
      name,
      description,
      item_class,
      subtype,
      stackable,
      serialized,
      transferable,
      status,
      metadata
    ) values (
      p_game_session_id,
      v_output_key,
      'business_product',
      v_product.name,
      'Finished good produced by ' || v_business.legal_name || '.',
      'finished_good',
      'business_product',
      true,
      false,
      true,
      case when v_product.status = 'retired' then 'retired' else 'active' end,
      jsonb_build_object(
        'businessId', v_business.id,
        'businessKey', v_business.public_key,
        'productId', v_product.id,
        'productKey', v_product.public_key,
        'currencyCode', v_business.currency_code
      )
    )
    on conflict (game_session_id, canonical_key) do update set
      name = excluded.name,
      description = excluded.description,
      status = excluded.status,
      metadata = public.game_items.metadata || excluded.metadata,
      version = public.game_items.version + 1,
      updated_at = now()
    returning * into v_output_item;

    if v_output_item.source_kind <> 'business_product'
      or v_output_item.metadata ->> 'productId' <> v_product.id::text
    then
      raise exception 'BUSINESS_PRODUCT_OUTPUT_IDENTITY_CONFLICT' using errcode = 'P0001';
    end if;

    delete from public.business_product_inputs
    where game_session_id = p_game_session_id
      and business_product_id = v_product.id;
    delete from public.business_product_outputs
    where game_session_id = p_game_session_id
      and business_product_id = v_product.id;

    for v_input in select value from jsonb_array_elements(p_inputs)
    loop
      v_input_key := lower(btrim(coalesce(v_input ->> 'itemKey', '')));
      v_quantity := coalesce((v_input ->> 'quantityPerUnit')::integer, 0);
      v_waste_rate := coalesce((v_input ->> 'wasteRate')::numeric, 0);
      v_group := nullif(lower(btrim(coalesce(v_input ->> 'substitutionGroup', ''))), '');

      if v_input_key !~ '^[a-z0-9][a-z0-9._-]{0,159}$'
        or v_quantity not between 1 and 100000
        or v_waste_rate not between 0 and 1
        or (v_group is not null and v_group !~ '^[a-z0-9][a-z0-9._-]{0,127}$')
      then
        raise exception 'BUSINESS_PRODUCT_INPUT_INVALID:%', v_input_key using errcode = 'P0001';
      end if;

      select gi.* into v_input_item
      from public.game_items gi
      where gi.game_session_id = p_game_session_id
        and gi.canonical_key = v_input_key
        and gi.status = 'active'
      for share;
      if not found then
        raise exception 'BUSINESS_PRODUCT_INPUT_ITEM_NOT_FOUND:%', v_input_key using errcode = 'P0001';
      end if;
      if v_input_item.id = v_output_item.id then
        raise exception 'BUSINESS_PRODUCT_OUTPUT_CANNOT_BE_INPUT' using errcode = 'P0001';
      end if;

      insert into public.business_product_inputs (
        game_session_id,
        business_product_id,
        input_game_item_id,
        quantity_per_unit,
        waste_rate,
        substitution_group
      ) values (
        p_game_session_id,
        v_product.id,
        v_input_item.id,
        v_quantity,
        v_waste_rate,
        v_group
      );
    end loop;

    insert into public.business_product_outputs (
      game_session_id,
      business_product_id,
      output_game_item_id,
      quantity_per_unit
    ) values (
      p_game_session_id,
      v_product.id,
      v_output_item.id,
      1
    );

    update public.business_products
    set
      product_kind = 'physical_good',
      output_game_item_id = v_output_item.id,
      version = version + 1,
      updated_at = now()
    where id = v_product.id
    returning * into v_product;

    v_result := jsonb_build_object(
      'productKey', v_product.public_key,
      'productKind', v_product.product_kind,
      'outputItemKey', v_output_item.canonical_key,
      'inputs', p_inputs,
      'replayed', false
    );
  end if;

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_game_session_id,
    'player',
    p_player_id,
    'business.product.material_flow.configure',
    'business_product',
    v_product.id,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'business_key', v_business.public_key,
      'product_key', v_product.public_key,
      'result', v_result
    )
  );

  return v_result;
end
$function$;

create or replace function public.contribute_player_inventory_to_business_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_item_key text,
  p_quantity integer,
  p_idempotency_key text
)
returns table (
  item_key text,
  player_quantity integer,
  business_quantity integer,
  unit_cost numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_item public.game_items%rowtype;
  v_player_account_id uuid;
  v_warehouse_account_id uuid;
  v_player_holding public.inventory_holdings%rowtype;
  v_business_holding public.inventory_holdings%rowtype;
  v_post jsonb;
  v_replayed boolean;
begin
  p_item_key := lower(btrim(coalesce(p_item_key, '')));
  if p_quantity is null
    or p_quantity not between 1 and 100000
    or p_item_key !~ '^[a-z0-9][a-z0-9._-]{0,159}$'
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160
  then
    raise exception 'BUSINESS_INVENTORY_CONTRIBUTION_INVALID' using errcode = 'P0001';
  end if;

  select be.* into v_business
  from public.business_entities be
  where be.game_session_id = p_game_session_id
    and be.public_key = lower(btrim(p_business_key))
    and be.owner_player_id = p_player_id
    and be.status in ('active', 'restructuring')
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select gi.* into v_item
  from public.game_items gi
  where gi.game_session_id = p_game_session_id
    and gi.canonical_key = p_item_key
    and gi.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_INVENTORY_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_player_account_id := economy_private.ensure_player_inventory_account_v2(
    p_game_session_id,
    p_player_id
  );
  v_warehouse_account_id := economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_business.id,
    'warehouse'
  );

  select h.* into v_player_holding
  from public.inventory_holdings h
  where h.game_session_id = p_game_session_id
    and h.inventory_account_id = v_player_account_id
    and h.game_item_id = v_item.id
  for update;
  if not found or v_player_holding.quantity_owned - v_player_holding.quantity_reserved < p_quantity then
    raise exception 'BUSINESS_INVENTORY_CONTRIBUTION_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_post := economy_private.post_inventory_transaction_v2(
    p_game_session_id,
    'transfer',
    'business',
    'owner_inventory_contribution',
    v_business.id,
    p_idempotency_key,
    jsonb_build_object(
      'businessKey', v_business.public_key,
      'itemKey', v_item.canonical_key,
      'quantity', p_quantity
    ),
    jsonb_build_array(
      jsonb_build_object(
        'inventoryAccountId', v_player_account_id,
        'gameItemId', v_item.id,
        'playerId', p_player_id,
        'storeItemId', v_player_holding.store_item_id,
        'quantityDelta', -p_quantity,
        'reservationDelta', 0,
        'unitCost', v_player_holding.average_unit_cost,
        'currencyCode', v_player_holding.cost_currency_code,
        'eventType', 'ADJUSTED',
        'legacyEventQuantityDelta', -p_quantity,
        'eventMetadata', jsonb_build_object(
          'businessKey', v_business.public_key,
          'itemKey', v_item.canonical_key,
          'quantity', p_quantity,
          'direction', 'to_business'
        )
      ),
      jsonb_build_object(
        'inventoryAccountId', v_warehouse_account_id,
        'gameItemId', v_item.id,
        'quantityDelta', p_quantity,
        'reservationDelta', 0,
        'unitCost', v_player_holding.average_unit_cost,
        'currencyCode', coalesce(v_player_holding.cost_currency_code, v_business.currency_code),
        'metadata', jsonb_build_object(
          'businessKey', v_business.public_key,
          'itemKey', v_item.canonical_key,
          'quantity', p_quantity,
          'direction', 'from_owner'
        )
      )
    )
  );
  v_replayed := coalesce((v_post ->> 'replayed')::boolean, false);

  select h.* into v_business_holding
  from public.inventory_holdings h
  where h.game_session_id = p_game_session_id
    and h.inventory_account_id = v_warehouse_account_id
    and h.game_item_id = v_item.id;

  if not v_replayed then
    insert into public.business_inventory (
      game_session_id,
      business_id,
      item_key,
      inventory_kind,
      quantity,
      unit_cost,
      inventory_account_id,
      game_item_id,
      total_cost_basis
    ) values (
      p_game_session_id,
      v_business.id,
      v_item.canonical_key,
      'input',
      v_business_holding.quantity_owned,
      v_business_holding.average_unit_cost,
      v_warehouse_account_id,
      v_item.id,
      round(v_business_holding.quantity_owned * v_business_holding.average_unit_cost, 4)
    )
    on conflict on constraint business_inventory_scope_unique do update set
      quantity = excluded.quantity,
      unit_cost = excluded.unit_cost,
      inventory_account_id = excluded.inventory_account_id,
      game_item_id = excluded.game_item_id,
      total_cost_basis = excluded.total_cost_basis,
      version = public.business_inventory.version + 1,
      updated_at = now();
  end if;

  select h.* into v_player_holding
  from public.inventory_holdings h
  where h.game_session_id = p_game_session_id
    and h.inventory_account_id = v_player_account_id
    and h.game_item_id = v_item.id;

  return query select
    v_item.canonical_key,
    coalesce(v_player_holding.quantity_owned, 0),
    coalesce(v_business_holding.quantity_owned, 0),
    coalesce(v_business_holding.average_unit_cost, 0),
    v_replayed;
end
$function$;

create or replace function public.purchase_business_input_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_product_key text,
  p_quantity integer,
  p_idempotency_key text
)
returns table (
  item_key text,
  quantity numeric,
  total_cost numeric,
  business_balance numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_product public.business_products%rowtype;
  v_context record;
  v_item public.business_inventory%rowtype;
  v_cost numeric;
  v_balance numeric := 0;
  v_entry uuid;
  v_existing public.audit_log%rowtype;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 100000 then
    raise exception 'INPUT_QUANTITY_INVALID' using errcode = 'P0001';
  end if;

  select be.* into v_business
  from public.business_entities be
  where be.game_session_id = p_game_session_id
    and be.public_key = lower(btrim(p_business_key))
    and be.owner_player_id = p_player_id
    and be.status = 'active'
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select bp.* into v_product
  from public.business_products bp
  where bp.game_session_id = p_game_session_id
    and bp.business_id = v_business.id
    and bp.public_key = lower(btrim(p_product_key))
    and bp.status = 'active';
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_product.product_kind <> 'legacy_abstract' then
    raise exception 'BUSINESS_CANONICAL_MATERIAL_ACQUISITION_REQUIRED'
      using errcode = 'P0001',
      hint = 'Acquire canonical BOM items through Store, Marketplace, Contract, or owner inventory contribution.';
  end if;

  select al.* into v_existing
  from public.audit_log al
  where al.game_session_id = p_game_session_id
    and al.actor_id = p_player_id
    and al.action = 'business.input.purchase'
    and al.target_id = v_business.id
    and al.metadata ->> 'idempotency_key' = p_idempotency_key;
  if found then
    select bi.* into v_item
    from public.business_inventory bi
    where bi.game_session_id = p_game_session_id
      and bi.business_id = v_business.id
      and bi.item_key = 'input:' || v_product.public_key;
    select ab.balance into v_balance
    from public.account_balances ab
    where ab.game_session_id = p_game_session_id
      and ab.player_id = p_player_id
      and ab.account_type = public.business_account_type_v1(v_business.public_key)
      and ab.currency_code = v_business.currency_code;
    return query select
      v_item.item_key,
      v_item.quantity,
      (v_existing.metadata ->> 'total_cost')::numeric,
      coalesce(v_balance, 0),
      true;
    return;
  end if;

  select * into v_context
  from public.resolve_player_economic_context_v1(p_game_session_id, p_player_id);

  v_cost := round(
    v_product.unit_input_cost
    * p_quantity
    * greatest(coalesce(v_context.supply_constraint_index, 1), 0.1)
    * (1 + greatest(coalesce(v_context.inflation_rate, 0), -0.05)),
    2
  );

  select ab.balance into v_balance
  from public.account_balances ab
  where ab.game_session_id = p_game_session_id
    and ab.player_id = p_player_id
    and ab.account_type = public.business_account_type_v1(v_business.public_key)
    and ab.currency_code = v_business.currency_code
  for update;
  if coalesce(v_balance, 0) < v_cost then
    raise exception 'INPUT_PURCHASE_UNAFFORDABLE' using errcode = 'P0001';
  end if;

  if v_cost > 0 then
    select ledger_entry_id into v_entry
    from public.record_player_ledger_entry(
      p_game_session_id,
      p_player_id,
      public.business_account_type_v1(v_business.public_key),
      -v_cost,
      v_business.currency_code,
      'debit',
      'business',
      'input_purchase',
      v_business.id,
      'player',
      p_player_id,
      jsonb_build_object(
        'business_key', v_business.public_key,
        'product_key', v_product.public_key,
        'quantity', p_quantity,
        'capitalized', true
      )
    );
  end if;

  insert into public.business_inventory (
    game_session_id,
    business_id,
    item_key,
    inventory_kind,
    quantity,
    unit_cost
  ) values (
    p_game_session_id,
    v_business.id,
    'input:' || v_product.public_key,
    'input',
    p_quantity,
    case when p_quantity > 0 then v_cost / p_quantity else 0 end
  )
  on conflict on constraint business_inventory_scope_unique do update set
    unit_cost = case
      when public.business_inventory.quantity + excluded.quantity <= 0 then 0
      else round(
        (
          public.business_inventory.quantity * public.business_inventory.unit_cost
          + excluded.quantity * excluded.unit_cost
        ) / (public.business_inventory.quantity + excluded.quantity),
        4
      )
    end,
    quantity = public.business_inventory.quantity + excluded.quantity,
    version = public.business_inventory.version + 1,
    updated_at = now()
  returning * into v_item;

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_game_session_id,
    'player',
    p_player_id,
    'business.input.purchase',
    'business',
    v_business.id,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'product_key', v_product.public_key,
      'quantity', p_quantity,
      'total_cost', v_cost,
      'ledger_entry_id', v_entry,
      'capitalized', true
    )
  );

  select ab.balance into v_balance
  from public.account_balances ab
  where ab.game_session_id = p_game_session_id
    and ab.player_id = p_player_id
    and ab.account_type = public.business_account_type_v1(v_business.public_key)
    and ab.currency_code = v_business.currency_code;

  return query select
    v_item.item_key,
    v_item.quantity,
    v_cost,
    coalesce(v_balance, 0),
    false;
end
$function$;

revoke all on function public.configure_business_product_material_flow_v2(
  uuid, uuid, text, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.configure_business_product_material_flow_v2(
  uuid, uuid, text, text, text, jsonb, text
) to service_role;

revoke all on function public.contribute_player_inventory_to_business_v2(
  uuid, uuid, text, text, integer, text
) from public, anon, authenticated;
grant execute on function public.contribute_player_inventory_to_business_v2(
  uuid, uuid, text, text, integer, text
) to service_role;

revoke all on function public.purchase_business_input_v1(
  uuid, uuid, text, text, integer, text
) from public, anon, authenticated;
grant execute on function public.purchase_business_input_v1(
  uuid, uuid, text, text, integer, text
) to service_role;

commit;
