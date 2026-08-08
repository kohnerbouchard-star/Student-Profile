-- Canonical Business production V2.
-- Material basis is carried into finished goods; cash is debited only for newly
-- incurred direct labor/overhead, eliminating the prior double material charge.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.run_business_production_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_product_key text,
  p_quantity integer,
  p_priority text,
  p_idempotency_key text
)
returns table (
  run_key text,
  status text,
  output_quantity integer,
  total_cost numeric,
  business_balance numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, economy_private, extensions, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_product public.business_products%rowtype;
  v_run public.business_production_runs%rowtype;
  v_hash text;
  v_input_cost numeric := 0;
  v_labor_cost numeric := 0;
  v_total_cost numeric := 0;
  v_balance numeric := 0;
  v_entry uuid;
  v_capacity numeric;
  v_legacy_input public.business_inventory%rowtype;
  v_legacy_output public.business_inventory%rowtype;
  v_input record;
  v_required integer;
  v_warehouse_account_id uuid;
  v_finished_account_id uuid;
  v_sink_account_id uuid;
  v_input_holding public.inventory_holdings%rowtype;
  v_output_holding public.inventory_holdings%rowtype;
  v_output_item public.game_items%rowtype;
  v_output_per_unit integer := 1;
  v_output_quantity integer := 0;
  v_post jsonb;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity > 10000 then
    raise exception 'PRODUCTION_QUANTITY_INVALID' using errcode = 'P0001';
  end if;
  if p_priority not in ('standard', 'expedite') then
    raise exception 'PRODUCTION_PRIORITY_INVALID' using errcode = 'P0001';
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
    and bp.status = 'active'
  for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select least(v_business.capacity_units, v_product.capacity_units)
    * coalesce(sum(emp.productivity_index), 1)
  into v_capacity
  from public.business_employees emp
  where emp.business_id = v_business.id
    and emp.status = 'active';
  if p_quantity > floor(v_capacity) then
    raise exception 'CAPACITY_EXCEEDED' using errcode = 'P0001';
  end if;

  v_hash := encode(extensions.digest(concat_ws(
    '|', p_game_session_id, p_player_id, v_business.id, v_product.id,
    p_quantity, p_priority, v_product.product_kind, v_product.version
  ), 'sha256'), 'hex');

  select run.* into v_run
  from public.business_production_runs run
  where run.game_session_id = p_game_session_id
    and run.requested_by_player_id = p_player_id
    and run.idempotency_key = p_idempotency_key;
  if found then
    if v_run.request_hash <> v_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    select ab.balance into v_balance
    from public.account_balances ab
    where ab.game_session_id = p_game_session_id
      and ab.player_id = p_player_id
      and ab.account_type = public.business_account_type_v1(v_business.public_key)
      and ab.currency_code = v_business.currency_code;
    return query select
      v_run.public_key,
      v_run.status,
      v_run.output_quantity,
      v_run.total_cost,
      coalesce(v_balance, 0),
      true;
    return;
  end if;

  v_labor_cost := round(
    v_product.unit_labor_cost
    * p_quantity
    * case when p_priority = 'expedite' then 1.25 else 1 end,
    2
  );

  if v_product.product_kind = 'legacy_abstract' then
    if v_product.unit_input_cost > 0 then
      select bi.* into v_legacy_input
      from public.business_inventory bi
      where bi.game_session_id = p_game_session_id
        and bi.business_id = v_business.id
        and bi.item_key = 'input:' || v_product.public_key
      for update;
      if not found or v_legacy_input.quantity < p_quantity then
        raise exception 'INSUFFICIENT_INPUT_INVENTORY' using errcode = 'P0001';
      end if;
      v_input_cost := round(v_legacy_input.unit_cost * p_quantity, 2);
    end if;
    v_output_quantity := p_quantity;
  elsif v_product.product_kind = 'physical_good' then
    if v_product.output_game_item_id is null then
      raise exception 'BUSINESS_PRODUCT_OUTPUT_NOT_CONFIGURED' using errcode = 'P0001';
    end if;

    select gi.* into v_output_item
    from public.game_items gi
    where gi.game_session_id = p_game_session_id
      and gi.id = v_product.output_game_item_id
      and gi.status = 'active'
    for share;
    if not found then
      raise exception 'BUSINESS_PRODUCT_OUTPUT_NOT_CONFIGURED' using errcode = 'P0001';
    end if;

    select bpo.quantity_per_unit into v_output_per_unit
    from public.business_product_outputs bpo
    where bpo.game_session_id = p_game_session_id
      and bpo.business_product_id = v_product.id
      and bpo.output_game_item_id = v_output_item.id;
    if not found or v_output_per_unit <= 0 then
      raise exception 'BUSINESS_PRODUCT_OUTPUT_NOT_CONFIGURED' using errcode = 'P0001';
    end if;
    v_output_quantity := p_quantity * v_output_per_unit;

    v_warehouse_account_id := economy_private.ensure_business_inventory_account_v2(
      p_game_session_id,
      v_business.id,
      'warehouse'
    );
    v_finished_account_id := economy_private.ensure_business_inventory_account_v2(
      p_game_session_id,
      v_business.id,
      'finished_goods'
    );
    v_sink_account_id := economy_private.ensure_system_inventory_account_v2(
      p_game_session_id,
      'system',
      'business.sink',
      'system_sink',
      null
    );

    if not exists (
      select 1
      from public.business_product_inputs bpi
      where bpi.game_session_id = p_game_session_id
        and bpi.business_product_id = v_product.id
    ) then
      raise exception 'BUSINESS_PRODUCT_INPUTS_NOT_CONFIGURED' using errcode = 'P0001';
    end if;

    for v_input in
      select
        bpi.id,
        bpi.input_game_item_id,
        bpi.quantity_per_unit,
        bpi.waste_rate,
        gi.canonical_key
      from public.business_product_inputs bpi
      join public.game_items gi
        on gi.game_session_id = bpi.game_session_id
       and gi.id = bpi.input_game_item_id
      where bpi.game_session_id = p_game_session_id
        and bpi.business_product_id = v_product.id
      order by bpi.input_game_item_id
    loop
      v_required := ceil(
        v_input.quantity_per_unit
        * p_quantity
        * (1 + v_input.waste_rate)
      )::integer;

      select h.* into v_input_holding
      from public.inventory_holdings h
      where h.game_session_id = p_game_session_id
        and h.inventory_account_id = v_warehouse_account_id
        and h.game_item_id = v_input.input_game_item_id
      for update;
      if not found or v_input_holding.quantity_owned - v_input_holding.quantity_reserved < v_required then
        raise exception 'INSUFFICIENT_INPUT_INVENTORY:%:%', v_input.canonical_key, v_required using errcode = 'P0001';
      end if;
      if v_input_holding.cost_currency_code is not null
        and v_input_holding.cost_currency_code <> v_business.currency_code
      then
        raise exception 'BUSINESS_INPUT_CURRENCY_MISMATCH:%', v_input.canonical_key using errcode = 'P0001';
      end if;

      v_input_cost := v_input_cost + round(v_required * v_input_holding.average_unit_cost, 4);
    end loop;
    v_input_cost := round(v_input_cost, 2);
  elsif v_product.product_kind = 'service' then
    v_input_cost := 0;
    v_output_quantity := p_quantity;
  else
    raise exception 'BUSINESS_PRODUCT_KIND_UNSUPPORTED' using errcode = 'P0001';
  end if;

  v_total_cost := v_input_cost + v_labor_cost;

  select ab.balance into v_balance
  from public.account_balances ab
  where ab.game_session_id = p_game_session_id
    and ab.player_id = p_player_id
    and ab.account_type = public.business_account_type_v1(v_business.public_key)
    and ab.currency_code = v_business.currency_code
  for update;
  if coalesce(v_balance, 0) < v_labor_cost then
    raise exception 'PRODUCTION_UNAFFORDABLE' using errcode = 'P0001';
  end if;

  insert into public.business_production_runs (
    game_session_id,
    business_id,
    product_id,
    requested_by_player_id,
    idempotency_key,
    request_hash,
    quantity,
    priority,
    status,
    input_cost,
    labor_cost,
    total_cost,
    output_quantity,
    completed_at
  ) values (
    p_game_session_id,
    v_business.id,
    v_product.id,
    p_player_id,
    p_idempotency_key,
    v_hash,
    p_quantity,
    p_priority,
    'completed',
    v_input_cost,
    v_labor_cost,
    v_total_cost,
    v_output_quantity,
    now()
  ) returning * into v_run;

  if v_product.product_kind = 'legacy_abstract' then
    if v_product.unit_input_cost > 0 then
      update public.business_inventory
      set
        quantity = quantity - p_quantity,
        total_cost_basis = round((quantity - p_quantity) * unit_cost, 4),
        version = version + 1,
        updated_at = now()
      where id = v_legacy_input.id;
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
      'finished:' || v_product.public_key,
      'finished_good',
      v_output_quantity,
      case when v_output_quantity > 0 then v_total_cost / v_output_quantity else 0 end
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
    returning * into v_legacy_output;
  elsif v_product.product_kind = 'physical_good' then
    for v_input in
      select
        bpi.id,
        bpi.input_game_item_id,
        bpi.quantity_per_unit,
        bpi.waste_rate,
        gi.canonical_key
      from public.business_product_inputs bpi
      join public.game_items gi
        on gi.game_session_id = bpi.game_session_id
       and gi.id = bpi.input_game_item_id
      where bpi.game_session_id = p_game_session_id
        and bpi.business_product_id = v_product.id
      order by bpi.input_game_item_id
    loop
      v_required := ceil(
        v_input.quantity_per_unit
        * p_quantity
        * (1 + v_input.waste_rate)
      )::integer;

      select h.* into v_input_holding
      from public.inventory_holdings h
      where h.game_session_id = p_game_session_id
        and h.inventory_account_id = v_warehouse_account_id
        and h.game_item_id = v_input.input_game_item_id
      for update;

      v_post := economy_private.post_inventory_transaction_v2(
        p_game_session_id,
        'production',
        'business',
        'production_input_consumed',
        v_run.id,
        p_idempotency_key || ':input:' || v_input.id::text,
        jsonb_build_object(
          'businessKey', v_business.public_key,
          'productKey', v_product.public_key,
          'runKey', v_run.public_key,
          'itemKey', v_input.canonical_key,
          'quantity', v_required
        ),
        jsonb_build_array(
          jsonb_build_object(
            'inventoryAccountId', v_warehouse_account_id,
            'gameItemId', v_input.input_game_item_id,
            'quantityDelta', -v_required,
            'reservationDelta', 0,
            'unitCost', v_input_holding.average_unit_cost,
            'currencyCode', coalesce(v_input_holding.cost_currency_code, v_business.currency_code),
            'metadata', jsonb_build_object('side', 'business_warehouse')
          ),
          jsonb_build_object(
            'inventoryAccountId', v_sink_account_id,
            'gameItemId', v_input.input_game_item_id,
            'quantityDelta', v_required,
            'reservationDelta', 0,
            'unitCost', v_input_holding.average_unit_cost,
            'currencyCode', coalesce(v_input_holding.cost_currency_code, v_business.currency_code),
            'metadata', jsonb_build_object('side', 'business_production_sink')
          )
        )
      );

      select h.* into v_input_holding
      from public.inventory_holdings h
      where h.game_session_id = p_game_session_id
        and h.inventory_account_id = v_warehouse_account_id
        and h.game_item_id = v_input.input_game_item_id;

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
        v_input.canonical_key,
        'input',
        v_input_holding.quantity_owned,
        v_input_holding.average_unit_cost,
        v_warehouse_account_id,
        v_input.input_game_item_id,
        round(v_input_holding.quantity_owned * v_input_holding.average_unit_cost, 4)
      )
      on conflict on constraint business_inventory_scope_unique do update set
        quantity = excluded.quantity,
        unit_cost = excluded.unit_cost,
        inventory_account_id = excluded.inventory_account_id,
        game_item_id = excluded.game_item_id,
        total_cost_basis = excluded.total_cost_basis,
        version = public.business_inventory.version + 1,
        updated_at = now();
    end loop;

    v_post := economy_private.post_inventory_transaction_v2(
      p_game_session_id,
      'production',
      'business',
      'production_output_granted',
      v_run.id,
      p_idempotency_key || ':output',
      jsonb_build_object(
        'businessKey', v_business.public_key,
        'productKey', v_product.public_key,
        'runKey', v_run.public_key,
        'itemKey', v_output_item.canonical_key,
        'quantity', v_output_quantity
      ),
      jsonb_build_array(jsonb_build_object(
        'inventoryAccountId', v_finished_account_id,
        'gameItemId', v_output_item.id,
        'quantityDelta', v_output_quantity,
        'reservationDelta', 0,
        'unitCost', case when v_output_quantity > 0 then v_total_cost / v_output_quantity else 0 end,
        'currencyCode', v_business.currency_code,
        'metadata', jsonb_build_object('side', 'business_finished_goods')
      ))
    );

    select h.* into v_output_holding
    from public.inventory_holdings h
    where h.game_session_id = p_game_session_id
      and h.inventory_account_id = v_finished_account_id
      and h.game_item_id = v_output_item.id;

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
      v_output_item.canonical_key,
      'finished_good',
      v_output_holding.quantity_owned,
      v_output_holding.average_unit_cost,
      v_finished_account_id,
      v_output_item.id,
      round(v_output_holding.quantity_owned * v_output_holding.average_unit_cost, 4)
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

  if v_labor_cost > 0 then
    select ledger_entry_id into v_entry
    from public.record_player_ledger_entry(
      p_game_session_id,
      p_player_id,
      public.business_account_type_v1(v_business.public_key),
      -v_labor_cost,
      v_business.currency_code,
      'debit',
      'business',
      'production_labor',
      v_run.id,
      'player',
      p_player_id,
      jsonb_build_object(
        'business_key', v_business.public_key,
        'run_key', v_run.public_key,
        'product_key', v_product.public_key,
        'labor_cost', v_labor_cost,
        'capitalized', v_product.product_kind <> 'service'
      )
    );
  end if;

  update public.business_production_runs
  set ledger_entry_id = v_entry
  where id = v_run.id
  returning * into v_run;

  select ab.balance into v_balance
  from public.account_balances ab
  where ab.game_session_id = p_game_session_id
    and ab.player_id = p_player_id
    and ab.account_type = public.business_account_type_v1(v_business.public_key)
    and ab.currency_code = v_business.currency_code;

  return query select
    v_run.public_key,
    v_run.status,
    v_run.output_quantity,
    v_run.total_cost,
    coalesce(v_balance, 0),
    false;
end
$function$;

revoke all on function public.run_business_production_v1(
  uuid, uuid, text, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.run_business_production_v1(
  uuid, uuid, text, text, integer, text, text
) to service_role;

commit;
