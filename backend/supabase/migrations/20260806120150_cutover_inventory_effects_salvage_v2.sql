-- Canonical consumable effects and equipment salvage V2.
-- Preserves public RPC signatures and existing effect/salvage state machines.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.use_player_inventory_item_effect_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_item_key text,
  p_target_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_pack_id uuid;
  v_item public.physical_economy_item_definitions%rowtype;
  v_game_item public.game_items%rowtype;
  v_effect public.physical_economy_effect_definitions%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_existing public.item_use_requests%rowtype;
  v_use public.item_use_requests%rowtype;
  v_grant public.item_effect_grants%rowtype;
  v_active public.item_effect_grants%rowtype;
  v_had_active boolean := false;
  v_hash text;
  v_now timestamptz := statement_timestamp();
  v_until timestamptz;
  v_cooldown timestamptz;
  v_action text := 'applied';
  v_player_account_id uuid;
  v_sink_account_id uuid;
  v_post jsonb;
begin
  p_item_key := lower(btrim(coalesce(p_item_key, '')));
  p_target_key := nullif(btrim(coalesce(p_target_key, '')), '');
  if p_item_key !~ '^[a-z0-9][a-z0-9._-]{0,159}$'
    or coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or length(coalesce(p_target_key, '')) > 128
  then
    raise exception 'ITEM_EFFECT_USE_INVALID' using errcode = 'P0001';
  end if;

  v_hash := md5(p_item_key || ':' || coalesce(p_target_key, ''));

  select * into v_existing
  from public.item_use_requests
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_existing.request_hash <> v_hash then
      raise exception 'ITEM_EFFECT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return v_existing.response_body || jsonb_build_object('outcome', 'replayed');
  end if;

  perform public.assert_player_crafting_mutation_allowed_v1(
    p_game_session_id,
    p_player_id
  );

  select gp.pack_id into v_pack_id
  from public.game_session_physical_economy_packs gp
  where gp.game_session_id = p_game_session_id
    and gp.status = 'active';

  select gi.* into v_game_item
  from public.game_items gi
  where gi.game_session_id = p_game_session_id
    and gi.canonical_key = p_item_key
    and gi.status = 'active'
  for share;
  if not found then
    raise exception 'ITEM_EFFECT_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select d.* into v_item
  from public.physical_economy_item_definitions d
  where d.id = v_game_item.physical_item_definition_id
    and d.pack_id = v_pack_id
    and d.item_class = 'consumable'
    and d.status = 'active';
  if not found or not v_item.effect_enabled then
    raise exception 'ITEM_EFFECT_UNSUPPORTED' using errcode = 'P0001';
  end if;

  select * into v_effect
  from public.physical_economy_effect_definitions
  where pack_id = v_pack_id
    and effect_code = v_item.effect_code
    and enabled
  for share;
  if not found
    or v_effect.effect_kind = 'disabled_repair'
    or public.physical_economy_safe_effect_handler_v1(v_effect.effect_code) is null
  then
    raise exception 'ITEM_EFFECT_UNSUPPORTED' using errcode = 'P0001';
  end if;

  v_player_account_id := economy_private.ensure_player_inventory_account_v2(
    p_game_session_id,
    p_player_id
  );
  v_sink_account_id := economy_private.ensure_system_inventory_account_v2(
    p_game_session_id,
    'system',
    'crafting.sink',
    'system_sink',
    null
  );

  select * into v_holding
  from public.inventory_holdings
  where game_session_id = p_game_session_id
    and inventory_account_id = v_player_account_id
    and game_item_id = v_game_item.id
  for update;
  if not found or v_holding.quantity_owned - v_holding.quantity_reserved < 1 then
    raise exception 'ITEM_EFFECT_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select * into v_active
  from public.item_effect_grants
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and effect_definition_id = v_effect.id
    and coalesce(target_key, '') = coalesce(p_target_key, '')
    and status = 'active'
    and (active_until is null or active_until > v_now)
  order by created_at desc
  limit 1
  for update;

  v_had_active := found;
  if v_had_active
    and v_active.cooldown_until is not null
    and v_active.cooldown_until > v_now
  then
    raise exception 'ITEM_EFFECT_COOLDOWN_ACTIVE' using errcode = 'P0001';
  end if;
  if v_had_active and v_effect.stacking_rule = 'nonstacking' then
    raise exception 'ITEM_EFFECT_ALREADY_ACTIVE' using errcode = 'P0001';
  end if;

  v_until := case
    when v_effect.duration_seconds = 0 then null
    else v_now + make_interval(secs => v_effect.duration_seconds)
  end;
  v_cooldown := case
    when v_effect.cooldown_seconds = 0 then null
    else v_now + make_interval(secs => v_effect.cooldown_seconds)
  end;

  insert into public.item_use_requests (
    game_session_id,
    player_id,
    store_item_id,
    inventory_account_id,
    game_item_id,
    item_key,
    effect_code,
    target_key,
    idempotency_key,
    request_hash,
    status,
    response_body
  ) values (
    p_game_session_id,
    p_player_id,
    v_holding.store_item_id,
    v_player_account_id,
    v_game_item.id,
    v_game_item.canonical_key,
    v_effect.effect_code,
    p_target_key,
    p_idempotency_key,
    v_hash,
    'applied',
    '{}'::jsonb
  ) returning * into v_use;

  v_post := economy_private.post_inventory_transaction_v2(
    p_game_session_id,
    'consumption',
    'item_effects',
    'effect_applied',
    v_use.id,
    p_idempotency_key || ':consume',
    jsonb_build_object(
      'useKey', v_use.public_id,
      'itemKey', v_game_item.canonical_key,
      'effectCode', v_effect.effect_code
    ),
    jsonb_build_array(
      jsonb_build_object(
        'inventoryAccountId', v_player_account_id,
        'gameItemId', v_game_item.id,
        'playerId', p_player_id,
        'storeItemId', v_holding.store_item_id,
        'quantityDelta', -1,
        'reservationDelta', 0,
        'unitCost', v_holding.average_unit_cost,
        'currencyCode', v_holding.cost_currency_code,
        'eventType', 'USED',
        'legacyEventQuantityDelta', -1,
        'eventMetadata', jsonb_build_object(
          'useKey', v_use.public_id,
          'itemKey', v_game_item.canonical_key,
          'effectCode', v_effect.effect_code
        )
      ),
      jsonb_build_object(
        'inventoryAccountId', v_sink_account_id,
        'gameItemId', v_game_item.id,
        'quantityDelta', 1,
        'reservationDelta', 0,
        'unitCost', v_holding.average_unit_cost,
        'currencyCode', v_holding.cost_currency_code,
        'metadata', jsonb_build_object('useKey', v_use.public_id, 'side', 'effect_sink')
      )
    )
  );

  if v_had_active and v_effect.stacking_rule in ('refresh', 'max', 'add_bounded', 'replace') then
    if v_effect.stacking_rule = 'add_bounded' then
      update public.item_effect_grants
      set
        stack_count = least(v_effect.max_stacks, stack_count + 1),
        active_until = v_until,
        cooldown_until = v_cooldown,
        updated_at = v_now
      where id = v_active.id
      returning * into v_grant;
      v_action := 'stacked';
    elsif v_effect.stacking_rule = 'max' then
      update public.item_effect_grants
      set
        active_until = case
          when active_until is null or v_until is null then null
          else greatest(active_until, v_until)
        end,
        cooldown_until = v_cooldown,
        updated_at = v_now
      where id = v_active.id
      returning * into v_grant;
      v_action := 'refreshed';
    else
      update public.item_effect_grants
      set status = 'revoked', updated_at = v_now
      where id = v_active.id;

      insert into public.item_effect_grants (
        game_session_id,
        player_id,
        effect_definition_id,
        effect_code,
        scope,
        target_key,
        stack_count,
        status,
        active_from,
        active_until,
        cooldown_until,
        source_use_id,
        public_payload
      ) values (
        p_game_session_id,
        p_player_id,
        v_effect.id,
        v_effect.effect_code,
        v_effect.scope,
        p_target_key,
        1,
        'active',
        v_now,
        v_until,
        v_cooldown,
        v_use.id,
        jsonb_build_object('handler', v_effect.handler_code, 'summary', v_effect.public_summary)
      ) returning * into v_grant;
      v_action := case when v_effect.stacking_rule = 'replace' then 'replaced' else 'refreshed' end;
    end if;
  else
    insert into public.item_effect_grants (
      game_session_id,
      player_id,
      effect_definition_id,
      effect_code,
      scope,
      target_key,
      stack_count,
      status,
      active_from,
      active_until,
      cooldown_until,
      source_use_id,
      public_payload
    ) values (
      p_game_session_id,
      p_player_id,
      v_effect.id,
      v_effect.effect_code,
      v_effect.scope,
      p_target_key,
      1,
      'active',
      v_now,
      v_until,
      v_cooldown,
      v_use.id,
      jsonb_build_object('handler', v_effect.handler_code, 'summary', v_effect.public_summary)
    ) returning * into v_grant;
  end if;

  insert into public.item_effect_history (
    game_session_id,
    player_id,
    effect_grant_id,
    item_use_id,
    effect_code,
    action,
    actor_type,
    actor_id,
    summary,
    metadata
  ) values (
    p_game_session_id,
    p_player_id,
    v_grant.id,
    v_use.id,
    v_effect.effect_code,
    v_action,
    'player',
    p_player_id,
    v_effect.public_summary,
    jsonb_build_object(
      'itemKey', v_game_item.canonical_key,
      'targetKey', p_target_key,
      'stackCount', v_grant.stack_count,
      'inventoryTransactionKey', v_post ->> 'transactionKey'
    )
  );

  update public.item_use_requests
  set response_body = jsonb_build_object(
    'outcome', 'applied',
    'useKey', v_use.public_id,
    'effectKey', v_grant.public_id,
    'effectCode', v_grant.effect_code,
    'scope', v_grant.scope,
    'targetKey', v_grant.target_key,
    'stackCount', v_grant.stack_count,
    'activeUntil', v_grant.active_until,
    'cooldownUntil', v_grant.cooldown_until,
    'committed', true,
    'refreshRequired', true
  )
  where id = v_use.id
  returning * into v_use;

  return v_use.response_body;
end
$function$;

create or replace function public.salvage_player_equipment_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_equipment_public_id text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_pack_id uuid;
  v_equipment public.equipment_instances%rowtype;
  v_rule public.physical_economy_salvage_rules%rowtype;
  v_existing public.equipment_salvage_jobs%rowtype;
  v_job public.equipment_salvage_jobs%rowtype;
  v_output jsonb;
  v_item_key text;
  v_quantity integer;
  v_game_item public.game_items%rowtype;
  v_input_holding public.inventory_holdings%rowtype;
  v_hash text;
  v_results jsonb := '[]'::jsonb;
  v_now timestamptz := statement_timestamp();
  v_player_account_id uuid;
  v_sink_account_id uuid;
  v_post jsonb;
begin
  if coalesce(p_equipment_public_id, '') !~ '^eqp_[0-9a-f]{32}$'
    or coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then
    raise exception 'SALVAGE_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  v_hash := md5(p_equipment_public_id);

  select * into v_existing
  from public.equipment_salvage_jobs
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_existing.request_hash <> v_hash then
      raise exception 'SALVAGE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'outcome', 'replayed',
      'salvageKey', v_existing.public_id,
      'status', v_existing.status,
      'outputs', v_existing.outputs,
      'committed', true,
      'refreshRequired', true
    );
  end if;

  perform public.assert_player_crafting_mutation_allowed_v1(
    p_game_session_id,
    p_player_id
  );

  select * into v_equipment
  from public.equipment_instances
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and public_id = p_equipment_public_id
  for update;
  if not found or v_equipment.status <> 'active' or v_equipment.equipped_slot is not null then
    raise exception 'SALVAGE_EQUIPMENT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select gp.pack_id into v_pack_id
  from public.game_session_physical_economy_packs gp
  where gp.game_session_id = p_game_session_id
    and gp.status = 'active';

  select * into v_rule
  from public.physical_economy_salvage_rules
  where pack_id = v_pack_id
    and equipment_item_key = v_equipment.item_key
    and enabled
  for share;
  if not found then
    raise exception 'SALVAGE_RULE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_player_account_id := economy_private.ensure_player_inventory_account_v2(
    p_game_session_id,
    p_player_id
  );
  v_sink_account_id := economy_private.ensure_system_inventory_account_v2(
    p_game_session_id,
    'system',
    'crafting.sink',
    'system_sink',
    null
  );

  select * into v_input_holding
  from public.inventory_holdings h
  where h.game_session_id = p_game_session_id
    and h.inventory_account_id = v_player_account_id
    and h.game_item_id = v_equipment.game_item_id
  for update;
  if not found or v_input_holding.quantity_owned - v_input_holding.quantity_reserved < 1 then
    raise exception 'SALVAGE_INVENTORY_PROJECTION_INVALID' using errcode = 'P0001';
  end if;

  v_post := economy_private.post_inventory_transaction_v2(
    p_game_session_id,
    'salvage',
    'equipment',
    'salvaged_input',
    v_equipment.id,
    p_idempotency_key || ':input',
    jsonb_build_object(
      'equipmentKey', v_equipment.public_id,
      'itemKey', v_equipment.item_key
    ),
    jsonb_build_array(
      jsonb_build_object(
        'inventoryAccountId', v_player_account_id,
        'gameItemId', v_equipment.game_item_id,
        'playerId', p_player_id,
        'storeItemId', v_equipment.store_item_id,
        'quantityDelta', -1,
        'reservationDelta', 0,
        'unitCost', v_input_holding.average_unit_cost,
        'currencyCode', v_input_holding.cost_currency_code,
        'eventType', 'USED',
        'legacyEventQuantityDelta', -1,
        'eventMetadata', jsonb_build_object(
          'equipmentKey', v_equipment.public_id,
          'itemKey', v_equipment.item_key
        )
      ),
      jsonb_build_object(
        'inventoryAccountId', v_sink_account_id,
        'gameItemId', v_equipment.game_item_id,
        'quantityDelta', 1,
        'reservationDelta', 0,
        'unitCost', v_input_holding.average_unit_cost,
        'currencyCode', v_input_holding.cost_currency_code,
        'metadata', jsonb_build_object('equipmentKey', v_equipment.public_id, 'side', 'salvage_sink')
      )
    )
  );

  for v_output in
    select value from jsonb_array_elements(v_rule.outputs)
  loop
    v_item_key := lower(v_output ->> 'itemKey');
    v_quantity := greatest(0, (v_output ->> 'quantity')::integer);
    if v_quantity = 0 then
      continue;
    end if;

    select gi.* into v_game_item
    from public.game_items gi
    where gi.game_session_id = p_game_session_id
      and gi.canonical_key = v_item_key
      and gi.status = 'active'
    for share;
    if not found then
      raise exception 'SALVAGE_OUTPUT_ITEM_UNAVAILABLE:%', v_item_key using errcode = 'P0001';
    end if;

    v_post := economy_private.post_inventory_transaction_v2(
      p_game_session_id,
      'salvage',
      'equipment',
      'salvaged_output',
      v_equipment.id,
      p_idempotency_key || ':output:' || v_item_key,
      jsonb_build_object(
        'equipmentKey', v_equipment.public_id,
        'itemKey', v_item_key,
        'quantity', v_quantity,
        'recoveryCapBasisPoints', v_rule.recovery_cap_basis_points
      ),
      jsonb_build_array(jsonb_build_object(
        'inventoryAccountId', v_player_account_id,
        'gameItemId', v_game_item.id,
        'playerId', p_player_id,
        'quantityDelta', v_quantity,
        'reservationDelta', 0,
        'eventType', 'ADJUSTED',
        'legacyEventQuantityDelta', v_quantity,
        'eventMetadata', jsonb_build_object(
          'equipmentKey', v_equipment.public_id,
          'itemKey', v_item_key,
          'quantity', v_quantity,
          'recoveryCapBasisPoints', v_rule.recovery_cap_basis_points
        )
      ))
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'itemKey', v_item_key,
      'quantity', v_quantity,
      'inventoryTransactionKey', v_post ->> 'transactionKey'
    ));
  end loop;

  update public.equipment_instances
  set status = 'salvaged', salvaged_at = v_now
  where id = v_equipment.id;

  insert into public.equipment_salvage_jobs (
    game_session_id,
    player_id,
    equipment_instance_id,
    idempotency_key,
    request_hash,
    status,
    outputs,
    settled_at
  ) values (
    p_game_session_id,
    p_player_id,
    v_equipment.id,
    p_idempotency_key,
    v_hash,
    'settled',
    v_results,
    v_now
  ) returning * into v_job;

  return jsonb_build_object(
    'outcome', 'settled',
    'salvageKey', v_job.public_id,
    'status', 'settled',
    'outputs', v_results,
    'recraftAvailableAt', v_now + make_interval(secs => v_rule.recraft_cooldown_seconds),
    'committed', true,
    'refreshRequired', true
  );
end
$function$;

revoke all on function public.use_player_inventory_item_effect_v1(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.use_player_inventory_item_effect_v1(
  uuid, uuid, text, text, text
) to service_role;

revoke all on function public.salvage_player_equipment_v1(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.salvage_player_equipment_v1(
  uuid, uuid, text, text
) to service_role;

commit;
