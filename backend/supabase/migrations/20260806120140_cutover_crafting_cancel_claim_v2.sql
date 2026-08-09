-- Canonical Player Crafting cancellation and claim V2.
-- Preserves the public RPC signatures, deterministic failure behavior, and replay contracts.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.cancel_player_crafting_job_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_job_public_id text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_job public.crafting_jobs%rowtype;
  v_res public.inventory_reservations%rowtype;
  v_post jsonb;
  v_now timestamptz := statement_timestamp();
begin
  if coalesce(p_job_public_id, '') !~ '^cft_[0-9a-f]{32}$'
    or coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then
    raise exception 'CRAFTING_CANCEL_INVALID' using errcode = 'P0001';
  end if;

  select * into v_job
  from public.crafting_jobs
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and public_id = p_job_public_id
  for update;
  if not found then
    raise exception 'CRAFTING_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_job.status = 'cancelled' then
    return jsonb_build_object(
      'outcome', 'replayed',
      'jobKey', v_job.public_id,
      'status', 'cancelled',
      'committed', true,
      'refreshRequired', true
    );
  end if;

  perform public.assert_player_crafting_mutation_allowed_v1(
    p_game_session_id,
    p_player_id
  );

  if v_job.status <> 'in_progress' then
    raise exception 'CRAFTING_JOB_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  for v_res in
    select r.*
    from public.inventory_reservations r
    where r.game_session_id = p_game_session_id
      and r.player_id = p_player_id
      and r.reason_type = 'crafting_input'
      and r.source_id = v_job.id
      and r.status = 'active'
    order by r.inventory_holding_id
    for update
  loop
    v_post := economy_private.post_inventory_transaction_v2(
      p_game_session_id,
      'release',
      'crafting',
      'job_cancelled',
      v_job.id,
      p_idempotency_key || ':release:' || v_res.id::text,
      jsonb_build_object(
        'jobKey', v_job.public_id,
        'itemKey', v_res.canonical_item_key,
        'quantity', v_res.quantity
      ),
      jsonb_build_array(jsonb_build_object(
        'inventoryAccountId', v_res.inventory_account_id,
        'gameItemId', v_res.game_item_id,
        'playerId', p_player_id,
        'storeItemId', v_res.store_item_id,
        'quantityDelta', 0,
        'reservationDelta', -v_res.quantity,
        'eventType', 'RELEASED',
        'legacyEventQuantityDelta', v_res.quantity,
        'eventMetadata', jsonb_build_object(
          'jobKey', v_job.public_id,
          'itemKey', v_res.canonical_item_key,
          'quantity', v_res.quantity
        )
      ))
    );

    update public.inventory_reservations
    set
      status = 'released',
      released_at = v_now,
      inventory_transaction_id = (v_post ->> 'transactionId')::uuid
    where id = v_res.id;

    update public.crafting_job_inputs
    set released_quantity = v_res.quantity
    where reservation_id = v_res.id;
  end loop;

  update public.crafting_jobs
  set status = 'cancelled', cancelled_at = v_now, updated_at = v_now
  where id = v_job.id
  returning * into v_job;

  insert into public.crafting_job_transitions (
    game_session_id,
    job_id,
    from_status,
    to_status,
    actor_type,
    actor_id,
    action,
    idempotency_key,
    outcome
  ) values (
    p_game_session_id,
    v_job.id,
    'in_progress',
    'cancelled',
    'player',
    p_player_id,
    'crafting.job_cancelled',
    p_idempotency_key,
    jsonb_build_object('released', true)
  );

  return jsonb_build_object(
    'outcome', 'cancelled',
    'jobKey', v_job.public_id,
    'status', v_job.status,
    'committed', true,
    'refreshRequired', true
  );
end
$function$;

create or replace function public.claim_player_crafting_job_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_job_public_id text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_job public.crafting_jobs%rowtype;
  v_res public.inventory_reservations%rowtype;
  v_output public.crafting_job_outputs%rowtype;
  v_game_item public.game_items%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_sink_account_id uuid;
  v_player_account_id uuid;
  v_post jsonb;
  v_instance_id text;
  v_instances jsonb := '[]'::jsonb;
  v_now timestamptz := statement_timestamp();
begin
  if coalesce(p_job_public_id, '') !~ '^cft_[0-9a-f]{32}$'
    or coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then
    raise exception 'CRAFTING_CLAIM_INVALID' using errcode = 'P0001';
  end if;

  select * into v_job
  from public.crafting_jobs
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and public_id = p_job_public_id
  for update;
  if not found then
    raise exception 'CRAFTING_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_job.status = 'claimed' then
    select coalesce(jsonb_agg(e.public_id order by e.public_id), '[]'::jsonb)
    into v_instances
    from public.equipment_instances e
    where e.game_session_id = p_game_session_id
      and e.player_id = p_player_id
      and e.source_job_id = v_job.id;

    return jsonb_build_object(
      'outcome', 'replayed',
      'jobKey', v_job.public_id,
      'status', 'claimed',
      'claimedAt', v_job.claimed_at,
      'equipment', v_instances,
      'committed', true,
      'refreshRequired', true
    );
  end if;

  if v_job.status = 'failed' then
    return jsonb_build_object(
      'outcome', 'replayed',
      'jobKey', v_job.public_id,
      'status', 'failed',
      'failureCode', v_job.failure_code,
      'committed', true,
      'refreshRequired', true
    );
  end if;

  perform public.assert_player_crafting_mutation_allowed_v1(
    p_game_session_id,
    p_player_id
  );

  if v_job.status = 'cancelled' then
    raise exception 'CRAFTING_JOB_NOT_CLAIMABLE' using errcode = 'P0001';
  end if;
  if v_now < v_job.completes_at then
    raise exception 'CRAFTING_JOB_NOT_READY' using errcode = 'P0001';
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

  if coalesce((v_job.recipe_snapshot ->> 'failureRoll')::integer, 10000) <
     coalesce((v_job.recipe_snapshot ->> 'failureBasisPoints')::integer, 0)
  then
    for v_res in
      select r.*
      from public.inventory_reservations r
      where r.game_session_id = p_game_session_id
        and r.player_id = p_player_id
        and r.reason_type = 'crafting_input'
        and r.source_id = v_job.id
        and r.status = 'active'
      order by r.inventory_holding_id
      for update
    loop
      select * into v_holding
      from public.inventory_holdings h
      where h.game_session_id = p_game_session_id
        and h.id = v_res.inventory_holding_id
      for update;
      if not found
        or v_holding.quantity_reserved < v_res.quantity
        or v_holding.quantity_owned < v_res.quantity
      then
        raise exception 'CRAFTING_RESERVATION_PROJECTION_INVALID' using errcode = 'P0001';
      end if;

      if v_job.failure_rule = 'consume_approved' then
        v_post := economy_private.post_inventory_transaction_v2(
          p_game_session_id,
          'consumption',
          'crafting',
          'job_failed_input',
          v_job.id,
          p_idempotency_key || ':failure-consume:' || v_res.id::text,
          jsonb_build_object(
            'jobKey', v_job.public_id,
            'failureRule', v_job.failure_rule,
            'itemKey', v_res.canonical_item_key
          ),
          jsonb_build_array(
            jsonb_build_object(
              'inventoryAccountId', v_res.inventory_account_id,
              'gameItemId', v_res.game_item_id,
              'playerId', p_player_id,
              'storeItemId', v_res.store_item_id,
              'quantityDelta', -v_res.quantity,
              'reservationDelta', -v_res.quantity,
              'unitCost', v_holding.average_unit_cost,
              'currencyCode', v_holding.cost_currency_code,
              'eventType', 'USED',
              'legacyEventQuantityDelta', -v_res.quantity,
              'eventMetadata', jsonb_build_object(
                'jobKey', v_job.public_id,
                'itemKey', v_res.canonical_item_key,
                'quantity', v_res.quantity,
                'failure', true
              )
            ),
            jsonb_build_object(
              'inventoryAccountId', v_sink_account_id,
              'gameItemId', v_res.game_item_id,
              'quantityDelta', v_res.quantity,
              'reservationDelta', 0,
              'unitCost', v_holding.average_unit_cost,
              'currencyCode', v_holding.cost_currency_code,
              'metadata', jsonb_build_object('jobKey', v_job.public_id, 'side', 'crafting_sink')
            )
          )
        );

        update public.inventory_reservations
        set
          status = 'consumed',
          consumed_at = v_now,
          inventory_transaction_id = (v_post ->> 'transactionId')::uuid
        where id = v_res.id;

        update public.crafting_job_inputs
        set consumed_quantity = v_res.quantity
        where reservation_id = v_res.id;
      else
        v_post := economy_private.post_inventory_transaction_v2(
          p_game_session_id,
          'release',
          'crafting',
          'job_failed_release',
          v_job.id,
          p_idempotency_key || ':failure-release:' || v_res.id::text,
          jsonb_build_object(
            'jobKey', v_job.public_id,
            'failureRule', v_job.failure_rule,
            'itemKey', v_res.canonical_item_key
          ),
          jsonb_build_array(jsonb_build_object(
            'inventoryAccountId', v_res.inventory_account_id,
            'gameItemId', v_res.game_item_id,
            'playerId', p_player_id,
            'storeItemId', v_res.store_item_id,
            'quantityDelta', 0,
            'reservationDelta', -v_res.quantity,
            'eventType', 'RELEASED',
            'legacyEventQuantityDelta', v_res.quantity,
            'eventMetadata', jsonb_build_object(
              'jobKey', v_job.public_id,
              'itemKey', v_res.canonical_item_key,
              'quantity', v_res.quantity,
              'failure', true
            )
          ))
        );

        update public.inventory_reservations
        set
          status = 'released',
          released_at = v_now,
          inventory_transaction_id = (v_post ->> 'transactionId')::uuid
        where id = v_res.id;

        update public.crafting_job_inputs
        set released_quantity = v_res.quantity
        where reservation_id = v_res.id;
      end if;
    end loop;

    update public.crafting_jobs
    set
      status = 'failed',
      failed_at = v_now,
      completed_at = v_now,
      failure_code = 'DETERMINISTIC_QUALITY_FAILURE',
      updated_at = v_now
    where id = v_job.id
    returning * into v_job;

    insert into public.crafting_job_transitions (
      game_session_id,
      job_id,
      from_status,
      to_status,
      actor_type,
      actor_id,
      action,
      idempotency_key,
      outcome
    ) values (
      p_game_session_id,
      v_job.id,
      'in_progress',
      'failed',
      'system',
      null,
      'crafting.job_failed',
      p_idempotency_key,
      jsonb_build_object(
        'failureCode', v_job.failure_code,
        'failureRule', v_job.failure_rule
      )
    );

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
      'system',
      null,
      'crafting.job_failed',
      'crafting_job',
      v_job.id,
      jsonb_build_object(
        'jobKey', v_job.public_id,
        'failureCode', v_job.failure_code,
        'failureRule', v_job.failure_rule
      )
    );

    return jsonb_build_object(
      'outcome', 'failed',
      'jobKey', v_job.public_id,
      'status', 'failed',
      'failureCode', v_job.failure_code,
      'failureRule', v_job.failure_rule,
      'committed', true,
      'refreshRequired', true
    );
  end if;

  for v_res in
    select r.*
    from public.inventory_reservations r
    where r.game_session_id = p_game_session_id
      and r.player_id = p_player_id
      and r.reason_type = 'crafting_input'
      and r.source_id = v_job.id
      and r.status = 'active'
    order by r.inventory_holding_id
    for update
  loop
    select * into v_holding
    from public.inventory_holdings h
    where h.game_session_id = p_game_session_id
      and h.id = v_res.inventory_holding_id
    for update;
    if not found
      or v_holding.quantity_reserved < v_res.quantity
      or v_holding.quantity_owned < v_res.quantity
    then
      raise exception 'CRAFTING_RESERVATION_PROJECTION_INVALID' using errcode = 'P0001';
    end if;

    v_post := economy_private.post_inventory_transaction_v2(
      p_game_session_id,
      'consumption',
      'crafting',
      'job_claimed_input',
      v_job.id,
      p_idempotency_key || ':consume:' || v_res.id::text,
      jsonb_build_object(
        'jobKey', v_job.public_id,
        'itemKey', v_res.canonical_item_key,
        'quantity', v_res.quantity
      ),
      jsonb_build_array(
        jsonb_build_object(
          'inventoryAccountId', v_res.inventory_account_id,
          'gameItemId', v_res.game_item_id,
          'playerId', p_player_id,
          'storeItemId', v_res.store_item_id,
          'quantityDelta', -v_res.quantity,
          'reservationDelta', -v_res.quantity,
          'unitCost', v_holding.average_unit_cost,
          'currencyCode', v_holding.cost_currency_code,
          'eventType', 'USED',
          'legacyEventQuantityDelta', -v_res.quantity,
          'eventMetadata', jsonb_build_object(
            'jobKey', v_job.public_id,
            'itemKey', v_res.canonical_item_key,
            'quantity', v_res.quantity
          )
        ),
        jsonb_build_object(
          'inventoryAccountId', v_sink_account_id,
          'gameItemId', v_res.game_item_id,
          'quantityDelta', v_res.quantity,
          'reservationDelta', 0,
          'unitCost', v_holding.average_unit_cost,
          'currencyCode', v_holding.cost_currency_code,
          'metadata', jsonb_build_object('jobKey', v_job.public_id, 'side', 'crafting_sink')
        )
      )
    );

    update public.inventory_reservations
    set
      status = 'consumed',
      consumed_at = v_now,
      inventory_transaction_id = (v_post ->> 'transactionId')::uuid
    where id = v_res.id;

    update public.crafting_job_inputs
    set consumed_quantity = v_res.quantity
    where reservation_id = v_res.id;
  end loop;

  for v_output in
    select o.*
    from public.crafting_job_outputs o
    where o.job_id = v_job.id
    order by o.line_key
    for update
  loop
    if v_output.granted_at is not null then
      continue;
    end if;

    select gi.* into v_game_item
    from public.game_items gi
    where gi.game_session_id = p_game_session_id
      and gi.id = v_output.game_item_id
      and gi.status = 'active'
    for share;
    if not found then
      raise exception 'CRAFTING_OUTPUT_ITEM_UNAVAILABLE:%', v_output.item_key using errcode = 'P0001';
    end if;

    v_post := economy_private.post_inventory_transaction_v2(
      p_game_session_id,
      'production',
      'crafting',
      'output_granted',
      v_job.id,
      p_idempotency_key || ':output:' || v_output.id::text,
      jsonb_build_object(
        'jobKey', v_job.public_id,
        'itemKey', v_game_item.canonical_key,
        'quantity', v_output.quantity,
        'outputKind', v_output.output_kind
      ),
      jsonb_build_array(jsonb_build_object(
        'inventoryAccountId', v_player_account_id,
        'gameItemId', v_game_item.id,
        'playerId', p_player_id,
        'quantityDelta', v_output.quantity,
        'reservationDelta', 0,
        'eventType', 'ADJUSTED',
        'legacyEventQuantityDelta', v_output.quantity,
        'eventMetadata', jsonb_build_object(
          'jobKey', v_job.public_id,
          'itemKey', v_game_item.canonical_key,
          'quantity', v_output.quantity,
          'outputKind', v_output.output_kind
        )
      ))
    );

    if v_output.output_kind = 'equipment' then
      for i in 1..v_output.quantity loop
        insert into public.equipment_instances (
          game_session_id,
          player_id,
          store_item_id,
          item_key,
          inventory_account_id,
          game_item_id,
          status,
          bonuses,
          source_job_id
        ) values (
          p_game_session_id,
          p_player_id,
          null,
          v_game_item.canonical_key,
          v_player_account_id,
          v_game_item.id,
          'active',
          coalesce((
            select d.metadata -> 'bonuses'
            from public.physical_economy_item_definitions d
            where d.id = v_game_item.physical_item_definition_id
          ), '{}'::jsonb),
          v_job.id
        ) returning public_id into v_instance_id;
        v_instances := v_instances || jsonb_build_array(v_instance_id);
      end loop;
    end if;

    update public.crafting_job_outputs
    set
      store_item_id = null,
      game_item_id = v_game_item.id,
      granted_quantity = v_output.quantity,
      granted_at = v_now
    where id = v_output.id;
  end loop;

  update public.crafting_jobs
  set
    status = 'claimed',
    completed_at = coalesce(completed_at, v_now),
    claimed_at = v_now,
    output_granted_at = v_now,
    updated_at = v_now
  where id = v_job.id
  returning * into v_job;

  insert into public.crafting_job_transitions (
    game_session_id,
    job_id,
    from_status,
    to_status,
    actor_type,
    actor_id,
    action,
    idempotency_key,
    outcome
  ) values (
    p_game_session_id,
    v_job.id,
    'in_progress',
    'claimed',
    'player',
    p_player_id,
    'crafting.job_claimed',
    p_idempotency_key,
    jsonb_build_object('outputGranted', true, 'equipment', v_instances)
  );

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
    'crafting.job_claimed',
    'crafting_job',
    v_job.id,
    jsonb_build_object(
      'jobKey', v_job.public_id,
      'recipeKey', v_job.recipe_key,
      'quantity', v_job.quantity,
      'inventoryAccountId', v_player_account_id
    )
  );

  return jsonb_build_object(
    'outcome', 'claimed',
    'jobKey', v_job.public_id,
    'status', 'claimed',
    'claimedAt', v_job.claimed_at,
    'qualityBand', v_job.quality_band,
    'equipment', v_instances,
    'committed', true,
    'refreshRequired', true
  );
end
$function$;

revoke all on function public.cancel_player_crafting_job_v1(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.cancel_player_crafting_job_v1(
  uuid, uuid, text, text
) to service_role;

revoke all on function public.claim_player_crafting_job_v1(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.claim_player_crafting_job_v1(
  uuid, uuid, text, text
) to service_role;

commit;
