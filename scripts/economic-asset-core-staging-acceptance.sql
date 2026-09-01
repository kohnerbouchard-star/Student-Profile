\set ON_ERROR_STOP on

begin;
set local request.jwt.claim.role = 'service_role';

-- The canonical beta Store catalog intentionally contains finished goods, not
-- every crafting input.  Materialize one rollback-only Store projection when
-- the connected environment has an active Player/crafting fixture but no
-- purchasable recipe input.  The surrounding transaction always rolls it back.
do $fixture$
declare
  v_candidate record;
begin
  if exists (
    select 1
    from public.players p
    join public.game_sessions g
      on g.id = p.game_session_id
     and g.status = 'active'
     and g.lifecycle_state = 'active'
    join public.player_country_assignments pca
      on pca.game_session_id = p.game_session_id
     and pca.player_id = p.id
     and pca.status = 'active'
    join public.country_profiles cp on cp.id = pca.country_profile_id
    join public.game_session_physical_economy_packs gp
      on gp.game_session_id = p.game_session_id
     and gp.status = 'active'
    join public.physical_economy_recipe_definitions r
      on r.pack_id = gp.pack_id
     and r.status = 'active'
    join public.game_session_recipe_availability a
      on a.game_session_id = p.game_session_id
     and a.recipe_id = r.id
     and a.enabled
     and a.scarcity_band <> 'unavailable'
     and a.unlocked_by_default
    join public.physical_economy_recipe_inputs i on i.recipe_id = r.id
    join public.game_items gi
      on gi.game_session_id = p.game_session_id
     and gi.canonical_key = i.item_key
     and gi.status = 'active'
    join public.store_items si
      on si.game_session_id = p.game_session_id
     and si.game_item_id = gi.id
     and si.status = 'active'
     and si.visibility = 'visible'
     and si.stock_quantity >= ceil(i.base_quantity * 1.3)::integer + 1
    where p.status = 'active'
      and (cardinality(a.country_codes) = 0 or cp.country_code = any(a.country_codes))
  ) then
    return;
  end if;

  select
    p.game_session_id,
    cp.currency_code,
    gi.id as game_item_id,
    gi.name,
    ceil(i.base_quantity * 1.3)::integer + 10 as stock_quantity
  into v_candidate
  from public.players p
  join public.game_sessions g
    on g.id = p.game_session_id
   and g.status = 'active'
   and g.lifecycle_state = 'active'
  join public.player_country_assignments pca
    on pca.game_session_id = p.game_session_id
   and pca.player_id = p.id
   and pca.status = 'active'
  join public.country_profiles cp on cp.id = pca.country_profile_id
  join public.game_session_physical_economy_packs gp
    on gp.game_session_id = p.game_session_id
   and gp.status = 'active'
  join public.physical_economy_recipe_definitions r
    on r.pack_id = gp.pack_id
   and r.status = 'active'
  join public.game_session_recipe_availability a
    on a.game_session_id = p.game_session_id
   and a.recipe_id = r.id
   and a.enabled
   and a.scarcity_band <> 'unavailable'
   and a.unlocked_by_default
  join public.physical_economy_recipe_inputs i on i.recipe_id = r.id
  join public.game_items gi
    on gi.game_session_id = p.game_session_id
   and gi.canonical_key = i.item_key
   and gi.status = 'active'
  where p.status = 'active'
    and (cardinality(a.country_codes) = 0 or cp.country_code = any(a.country_codes))
  order by p.game_session_id, p.id, r.recipe_key, i.line_key
  limit 1;

  if found then
    insert into public.store_items (
      game_session_id,
      item_key,
      name,
      category,
      price,
      currency_code,
      stock_quantity,
      status,
      visibility,
      game_item_id
    ) values (
      v_candidate.game_session_id,
      'economic_probe_' || substring(md5(v_candidate.game_item_id::text), 1, 32),
      v_candidate.name,
      'goods',
      10,
      v_candidate.currency_code,
      v_candidate.stock_quantity,
      'active',
      'visible',
      v_candidate.game_item_id
    );
  end if;
end
$fixture$;

do $probe$
declare
  v_fixture record;
  v_input_line record;
  v_purchase_result record;
  v_business_result record;
  v_product_result record;
  v_contribution_result record;
  v_run_result record;
  v_run_row public.business_production_runs%rowtype;
  v_player_account_id uuid;
  v_purchased_holding public.inventory_holdings%rowtype;
  v_output_holding public.inventory_holdings%rowtype;
  v_finished_holding public.inventory_holdings%rowtype;
  v_business_id uuid;
  v_product_id uuid;
  v_job_id uuid;
  v_job_key text;
  v_quote_key text;
  v_output_game_item_id uuid;
  v_business_key text;
  v_product_key text;
  v_business_account text;
  v_balance_before numeric;
  v_balance_after numeric;
  v_result jsonb;
  v_validation jsonb;
begin
  select
    p.game_session_id as game_id,
    p.id as player_id,
    cp.country_code,
    si.currency_code,
    si.id as store_item_id,
    si.item_key as store_item_key,
    si.game_item_id as material_game_item_id,
    gi.canonical_key as material_key,
    si.price as store_price,
    r.id as recipe_id,
    r.recipe_key,
    crafting_difficulty.input_multiplier,
    ceil(
      i.base_quantity * case
        when i.scaling_class <> 'elastic_common' then 1
        else crafting_difficulty.input_multiplier
      end
    )::integer as primary_required
  into v_fixture
  from public.players p
  join public.game_sessions g
    on g.id = p.game_session_id
   and g.status = 'active'
   and g.lifecycle_state = 'active'
  left join public.game_difficulty_policy_settings difficulty_policy
    on difficulty_policy.game_session_id = p.game_session_id
  left join public.game_settings game_setting
    on game_setting.game_session_id = p.game_session_id
  cross join lateral (
    select case
      when difficulty_policy.game_session_id is not null then coalesce(
        nullif(lower(difficulty_policy.difficulty_preset), 'standard'),
        'moderate'
      )
      else coalesce(
        nullif(lower(game_setting.difficulty_preset), 'standard'),
        'moderate'
      )
    end as difficulty_key
  ) effective_difficulty
  cross join lateral (
    select case effective_difficulty.difficulty_key
      when 'easy' then 0.9
      when 'hard' then 1.15
      when 'insane' then 1.3
      else 1
    end as input_multiplier
  ) crafting_difficulty
  join public.player_country_assignments pca
    on pca.game_session_id = p.game_session_id
   and pca.player_id = p.id
   and pca.status = 'active'
  join public.country_profiles cp on cp.id = pca.country_profile_id
  join public.game_session_physical_economy_packs gp
    on gp.game_session_id = p.game_session_id
   and gp.status = 'active'
  join public.physical_economy_recipe_definitions r
    on r.pack_id = gp.pack_id
   and r.status = 'active'
  join public.game_session_recipe_availability a
    on a.game_session_id = p.game_session_id
   and a.recipe_id = r.id
   and a.enabled
   and a.scarcity_band <> 'unavailable'
   and a.unlocked_by_default
  join public.physical_economy_recipe_inputs i on i.recipe_id = r.id
  join public.game_items gi
    on gi.game_session_id = p.game_session_id
   and gi.canonical_key = i.item_key
   and gi.status = 'active'
  join public.store_items si
    on si.game_session_id = p.game_session_id
   and si.game_item_id = gi.id
   and si.status = 'active'
   and si.visibility = 'visible'
   and si.stock_quantity >= ceil(
     i.base_quantity * case
       when i.scaling_class = 'elastic_common'
         then crafting_difficulty.input_multiplier
       else 1
     end
   )::integer + 1
  where p.status = 'active'
    and (cardinality(a.country_codes) = 0 or cp.country_code = any(a.country_codes))
  order by p.game_session_id, p.id, r.recipe_key, i.line_key, si.item_key
  limit 1;

  if v_fixture.game_id is null then
    raise exception 'ECONOMIC_ASSET_PROBE_FIXTURE_UNAVAILABLE';
  end if;

  perform *
  from public.record_player_ledger_entry(
    v_fixture.game_id,
    v_fixture.player_id,
    'cash',
    1000000,
    v_fixture.currency_code,
    'credit',
    'setup',
    'initial_balance_seed',
    v_fixture.player_id,
    'system',
    null,
    jsonb_build_object(
      'rollback_only', true,
      'bankTransactionIdempotencyKey', 'economic-asset-probe-funding-v2'
    )
  );

  insert into public.store_purchase_quotes (
    game_session_id, player_id, store_item_id, quantity, currency_code,
    base_unit_price, inflation_multiplier, location_multiplier,
    scarcity_multiplier, discount_amount, final_unit_price,
    final_total_price, pricing_version, status, expires_at,
    item_currency_code, player_currency_code, exchange_rate,
    item_local_final_unit_price, item_local_final_total_price
  ) values (
    v_fixture.game_id,
    v_fixture.player_id,
    v_fixture.store_item_id,
    v_fixture.primary_required + 1,
    v_fixture.currency_code,
    v_fixture.store_price,
    1, 1, 1, 0,
    v_fixture.store_price,
    round(v_fixture.store_price * (v_fixture.primary_required + 1), 2),
    'economic-asset-core-staging-probe-v2',
    'CREATED',
    statement_timestamp() + interval '15 minutes',
    v_fixture.currency_code,
    v_fixture.currency_code,
    1,
    v_fixture.store_price,
    round(v_fixture.store_price * (v_fixture.primary_required + 1), 2)
  ) returning public_quote_key into v_quote_key;

  select * into v_purchase_result
  from public.purchase_quoted_store_item_public_v1(
    v_fixture.game_id,
    v_fixture.player_id,
    v_quote_key,
    'economic-asset-probe-store-purchase-v2',
    statement_timestamp(),
    jsonb_build_object('rollback_only', true)
  );

  if v_purchase_result.already_completed
    or v_purchase_result.item_key <> v_fixture.store_item_key
    or v_purchase_result.inventory_quantity_owned < v_fixture.primary_required + 1
  then
    raise exception 'ECONOMIC_ASSET_STORE_PURCHASE_FAILED';
  end if;

  v_player_account_id := economy_private.ensure_player_inventory_account_v2(
    v_fixture.game_id,
    v_fixture.player_id
  );

  select h.* into v_purchased_holding
  from public.inventory_holdings h
  where h.game_session_id = v_fixture.game_id
    and h.inventory_account_id = v_player_account_id
    and h.game_item_id = v_fixture.material_game_item_id;

  if not found
    or v_purchased_holding.store_item_id is distinct from v_fixture.store_item_id
    or v_purchased_holding.quantity_owned < v_fixture.primary_required + 1
    or v_purchased_holding.average_unit_cost <= 0
  then
    raise exception 'ECONOMIC_ASSET_STORE_OWNERSHIP_FAILED';
  end if;

  for v_input_line in
    select
      i.line_key,
      i.item_key,
      ceil(
        i.base_quantity * case
          when i.scaling_class = 'elastic_common'
            then v_fixture.input_multiplier
          else 1
        end
      )::integer as required_quantity,
      gi.id as game_item_id
    from public.physical_economy_recipe_inputs i
    join public.game_items gi
      on gi.game_session_id = v_fixture.game_id
     and gi.canonical_key = i.item_key
    where i.recipe_id = v_fixture.recipe_id
    order by i.line_key
  loop
    if v_input_line.game_item_id = v_fixture.material_game_item_id then
      continue;
    end if;

    v_result := economy_private.post_inventory_transaction_v2(
      v_fixture.game_id,
      'grant',
      'validation',
      'crafting_input_grant',
      null,
      'economic-asset-probe-grant:' || v_input_line.line_key,
      jsonb_build_object('rollback_only', true, 'itemKey', v_input_line.item_key),
      jsonb_build_array(jsonb_build_object(
        'inventoryAccountId', v_player_account_id,
        'gameItemId', v_input_line.game_item_id,
        'playerId', v_fixture.player_id,
        'quantityDelta', v_input_line.required_quantity,
        'reservationDelta', 0,
        'unitCost', 1,
        'currencyCode', v_fixture.currency_code,
        'eventType', 'ADJUSTED',
        'legacyEventQuantityDelta', v_input_line.required_quantity,
        'eventMetadata', jsonb_build_object('rollback_only', true)
      ))
    );
  end loop;

  v_result := public.start_player_crafting_job_v1(
    v_fixture.game_id,
    v_fixture.player_id,
    v_fixture.recipe_key,
    1,
    '{}'::jsonb,
    'economic-asset-probe-crafting-start-v2'
  );
  v_job_key := v_result ->> 'jobKey';

  select j.id into v_job_id
  from public.crafting_jobs j
  where j.game_session_id = v_fixture.game_id
    and j.player_id = v_fixture.player_id
    and j.public_id = v_job_key;

  if v_job_id is null or not exists (
    select 1
    from public.inventory_reservations r
    where r.game_session_id = v_fixture.game_id
      and r.player_id = v_fixture.player_id
      and r.source_id = v_job_id
      and r.game_item_id = v_fixture.material_game_item_id
      and r.reason_type = 'crafting_input'
      and r.status = 'active'
  ) then
    raise exception 'ECONOMIC_ASSET_CRAFTING_RESERVATION_FAILED';
  end if;

  update public.crafting_jobs
  set
    completes_at = statement_timestamp() - interval '1 second',
    recipe_snapshot = recipe_snapshot || jsonb_build_object('failureBasisPoints', 0)
  where id = v_job_id;

  v_result := public.claim_player_crafting_job_v1(
    v_fixture.game_id,
    v_fixture.player_id,
    v_job_key,
    'economic-asset-probe-crafting-claim-v2'
  );
  if v_result ->> 'status' <> 'claimed' then
    raise exception 'ECONOMIC_ASSET_CRAFTING_CLAIM_FAILED:%', v_result;
  end if;

  select o.game_item_id into v_output_game_item_id
  from public.crafting_job_outputs o
  where o.job_id = v_job_id
  order by o.line_key
  limit 1;

  select h.* into v_output_holding
  from public.inventory_holdings h
  where h.game_session_id = v_fixture.game_id
    and h.inventory_account_id = v_player_account_id
    and h.game_item_id = v_output_game_item_id;

  if not found
    or v_output_holding.quantity_owned <= 0
    or v_output_holding.store_item_id is not null
  then
    raise exception 'ECONOMIC_ASSET_CRAFTING_OUTPUT_FAILED';
  end if;

  select * into v_business_result
  from public.create_or_acquire_player_business_v1(
    v_fixture.game_id,
    v_fixture.player_id,
    'Rollback Economic Asset Probe',
    'corporation',
    'manufacturing',
    v_fixture.country_code,
    v_fixture.currency_code,
    1000,
    null,
    'economic-asset-probe-business-create-v2'
  );
  v_business_key := v_business_result.business_key;

  select be.id into v_business_id
  from public.business_entities be
  where be.game_session_id = v_fixture.game_id
    and be.public_key = v_business_key;

  select * into v_product_result
  from public.submit_business_product_v1(
    v_fixture.game_id,
    v_fixture.player_id,
    v_business_key,
    'Canonical Probe Product',
    'manufactured_good',
    100,
    0,
    0,
    10,
    10,
    80,
    'economic-asset-probe-product-submit-v2'
  );
  v_product_key := v_product_result.product_key;

  update public.business_products bp
  set status = 'active'
  where bp.game_session_id = v_fixture.game_id
    and bp.business_id = v_business_id
    and bp.public_key = v_product_key
  returning bp.id into v_product_id;

  v_result := public.configure_business_product_material_flow_v2(
    v_fixture.game_id,
    v_fixture.player_id,
    v_business_key,
    v_product_key,
    'physical_good',
    jsonb_build_array(jsonb_build_object(
      'itemKey', v_fixture.material_key,
      'quantityPerUnit', 1,
      'wasteRate', 0
    )),
    'economic-asset-probe-product-configure-v2'
  );

  select * into v_contribution_result
  from public.contribute_player_inventory_to_business_v2(
    v_fixture.game_id,
    v_fixture.player_id,
    v_business_key,
    v_fixture.material_key,
    1,
    'economic-asset-probe-business-contribution-v2'
  );
  if v_contribution_result.business_quantity < 1
    or v_contribution_result.unit_cost <= 0
  then
    raise exception 'ECONOMIC_ASSET_BUSINESS_CONTRIBUTION_FAILED';
  end if;

  v_business_account := public.business_account_type_v1(v_business_key);
  select ab.balance into v_balance_before
  from public.account_balances ab
  where ab.game_session_id = v_fixture.game_id
    and ab.player_id = v_fixture.player_id
    and ab.account_type = v_business_account
    and ab.currency_code = v_fixture.currency_code;

  select * into v_run_result
  from public.run_business_production_v1(
    v_fixture.game_id,
    v_fixture.player_id,
    v_business_key,
    v_product_key,
    1,
    'standard',
    'economic-asset-probe-production-v2'
  );

  select pr.* into v_run_row
  from public.business_production_runs pr
  where pr.game_session_id = v_fixture.game_id
    and pr.public_key = v_run_result.run_key;

  select ab.balance into v_balance_after
  from public.account_balances ab
  where ab.game_session_id = v_fixture.game_id
    and ab.player_id = v_fixture.player_id
    and ab.account_type = v_business_account
    and ab.currency_code = v_fixture.currency_code;

  if v_run_row.input_cost <= 0
    or v_run_row.total_cost <= v_run_row.labor_cost
    or round(v_balance_before - v_balance_after, 2) <> round(v_run_row.labor_cost, 2)
  then
    raise exception 'ECONOMIC_ASSET_BUSINESS_COST_CARRY_FAILED';
  end if;

  select h.* into v_finished_holding
  from public.inventory_holdings h
  join public.business_products bp
    on bp.game_session_id = h.game_session_id
   and bp.output_game_item_id = h.game_item_id
  join public.inventory_accounts ia
    on ia.game_session_id = h.game_session_id
   and ia.id = h.inventory_account_id
   and ia.account_kind = 'finished_goods'
  where h.game_session_id = v_fixture.game_id
    and bp.id = v_product_id;

  if not found
    or v_finished_holding.quantity_owned <> 1
    or v_finished_holding.average_unit_cost <= 0
  then
    raise exception 'ECONOMIC_ASSET_BUSINESS_OUTPUT_FAILED';
  end if;

  begin
    perform *
    from public.settle_business_cycle_v1(
      v_fixture.game_id,
      v_business_key,
      'economic-asset-probe-settlement-v2',
      1, 1, 1, 1
    );
    raise exception 'ECONOMIC_ASSET_LEGACY_BUSINESS_SALE_NOT_RETIRED';
  exception
    when others then
      if sqlerrm <> 'BUSINESS_CYCLE_SETTLEMENT_RETIRED' then
        raise;
      end if;
  end;

  if exists (
    select 1
    from public.business_sales bs
    where bs.game_session_id = v_fixture.game_id
      and bs.business_id = v_business_id
      and bs.product_id = v_product_id
      and bs.settlement_key = 'economic-asset-probe-settlement-v2'
  ) then
    raise exception 'ECONOMIC_ASSET_LEGACY_BUSINESS_SALE_WRITTEN';
  end if;

  v_validation := public.validate_economic_asset_core_v2(v_fixture.game_id);
  if coalesce((v_validation ->> 'valid')::boolean, false) is not true then
    raise exception 'ECONOMIC_ASSET_VALIDATION_FAILED:%', v_validation;
  end if;

  if not exists (
    select 1 from public.inventory_transactions t
    where t.game_session_id = v_fixture.game_id
      and t.status = 'committed'
      and t.source_domain = 'store'
      and t.source_action = 'store_purchase'
  ) or not exists (
    select 1 from public.inventory_transactions t
    where t.game_session_id = v_fixture.game_id
      and t.status = 'committed'
      and t.source_domain = 'crafting'
      and t.source_action = 'output_granted'
  ) or not exists (
    select 1 from public.inventory_transactions t
    where t.game_session_id = v_fixture.game_id
      and t.status = 'committed'
      and t.source_domain = 'business'
      and t.source_action = 'production_output_granted'
  ) or exists (
    select 1 from public.inventory_transactions t
    where t.game_session_id = v_fixture.game_id
      and t.status = 'committed'
      and t.source_domain = 'business'
      and t.source_action = 'sale_settled'
  ) then
    raise exception 'ECONOMIC_ASSET_JOURNAL_EVIDENCE_MISSING';
  end if;

  raise notice 'ECONOMIC_ASSET_CORE_STAGING_ACCEPTANCE_PASS';
end
$probe$;

rollback;
