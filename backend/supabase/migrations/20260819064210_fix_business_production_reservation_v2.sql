-- Make V2 production reservation single-pass and fully atomic.
-- A job row is inserted before BOM reservation, then each canonical Inventory
-- reservation is posted exactly once. Any later failure aborts the transaction,
-- including the job row and all earlier reservations.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.start_business_production_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_recipe_key text,
  p_quantity integer,
  p_idempotency_key text
)
returns table (
  job_key text,
  status text,
  output_item_key text,
  quantity integer,
  completion_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_recipe public.business_recipe_definitions%rowtype;
  v_job public.business_production_jobs_v2%rowtype;
  v_output_item public.game_items%rowtype;
  v_batches integer;
  v_capacity_required integer;
  v_capacity_available integer;
  v_requirement record;
  v_input record;
  v_warehouse uuid;
  v_wip uuid;
  v_tx uuid;
  v_duration_multiplier numeric := 1;
  v_capacity_ratio numeric := 1;
  v_completion timestamptz;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then
    raise exception 'BUSINESS_PRODUCTION_QUANTITY_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status <> 'closed'
    and business_row.formation_state = 'operational'
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.business_ownership_positions as position_row
    where position_row.game_session_id = p_game_session_id
      and position_row.business_id = v_business.id
      and position_row.player_id = p_player_id
      and position_row.status = 'active'
  ) then
    raise exception 'BUSINESS_OWNERSHIP_REQUIRED' using errcode = 'P0001';
  end if;

  select recipe_row.*
  into v_recipe
  from public.business_recipe_definitions as recipe_row
  where recipe_row.game_session_id = p_game_session_id
    and recipe_row.public_key = lower(btrim(p_recipe_key))
    and recipe_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_RECIPE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_recipe.industry_code <> v_business.industry_code then
    raise exception 'BUSINESS_RECIPE_INDUSTRY_MISMATCH' using errcode = 'P0001';
  end if;

  perform public.ensure_business_starter_recipe_unlocks_v2(
    p_game_session_id,
    v_business.id
  );
  if not exists (
    select 1
    from public.business_recipe_unlocks as unlock_row
    where unlock_row.game_session_id = p_game_session_id
      and unlock_row.business_id = v_business.id
      and unlock_row.recipe_id = v_recipe.id
  ) then
    raise exception 'BUSINESS_RECIPE_UNLOCK_REQUIRED' using errcode = 'P0001';
  end if;

  if mod(p_quantity, v_recipe.batch_size) <> 0 then
    raise exception 'BUSINESS_PRODUCTION_BATCH_SIZE_REQUIRED' using errcode = 'P0001';
  end if;

  select job_row.*
  into v_job
  from public.business_production_jobs_v2 as job_row
  where job_row.game_session_id = p_game_session_id
    and job_row.business_id = v_business.id
    and job_row.started_by_player_id = p_player_id
    and job_row.idempotency_key = p_idempotency_key;
  if found then
    if v_job.recipe_id <> v_recipe.id
      or v_job.requested_output_quantity <> p_quantity
    then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    select item_row.* into v_output_item
    from public.game_items as item_row
    where item_row.id = v_recipe.output_game_item_id;
    return query select
      v_job.public_key,
      v_job.status,
      v_output_item.public_key,
      v_job.requested_output_quantity,
      v_job.completion_at,
      true;
    return;
  end if;

  if not public.business_recipe_workforce_ready_v2(
    p_game_session_id,
    v_business.id,
    v_recipe.id
  ) then
    raise exception 'BUSINESS_PRODUCTION_WORKFORCE_REQUIREMENTS_NOT_MET' using errcode = 'P0001';
  end if;

  v_batches := p_quantity / v_recipe.batch_size;
  v_capacity_required := greatest(
    1,
    ceil(v_recipe.base_capacity_units * p_quantity::numeric / v_recipe.batch_size)::integer
  );

  for v_requirement in
    select requirement_row.*
    from public.business_recipe_equipment_requirements as requirement_row
    where requirement_row.game_session_id = p_game_session_id
      and requirement_row.recipe_id = v_recipe.id
    order by requirement_row.capability_key
  loop
    v_capacity_available := public.business_equipment_capacity_v2(
      p_game_session_id,
      v_business.id,
      v_requirement.capability_key,
      now()
    );
    if v_capacity_available < v_requirement.minimum_capacity then
      raise exception 'BUSINESS_PRODUCTION_EQUIPMENT_REQUIREMENTS_NOT_MET' using errcode = 'P0001';
    end if;
    v_capacity_ratio := least(
      v_capacity_ratio,
      v_capacity_available::numeric / greatest(1, v_requirement.minimum_capacity)
    );
  end loop;

  v_duration_multiplier := greatest(
    0.50,
    least(1.0, 1 / greatest(1, v_capacity_ratio))
  );
  v_completion := now() + make_interval(
    secs => ceil(
      v_recipe.production_duration_minutes * 60 * v_batches * v_duration_multiplier
    )::integer
  );

  insert into public.business_production_jobs_v2(
    game_session_id,
    business_id,
    recipe_id,
    started_by_player_id,
    requested_output_quantity,
    batch_count,
    reserved_capacity_units,
    status,
    completion_at,
    idempotency_key,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    v_recipe.id,
    p_player_id,
    p_quantity,
    v_batches,
    v_capacity_required,
    'in_progress',
    v_completion,
    p_idempotency_key,
    jsonb_build_object(
      'recipeKey', v_recipe.public_key,
      'durationMultiplier', v_duration_multiplier
    )
  )
  returning * into v_job;

  v_warehouse := economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_business.id,
    'warehouse'
  );
  v_wip := economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_business.id,
    'work_in_progress'
  );

  for v_input in
    select input_row.*
    from public.business_recipe_inputs as input_row
    where input_row.game_session_id = p_game_session_id
      and input_row.recipe_id = v_recipe.id
    order by input_row.game_item_id
  loop
    select transaction_id into v_tx
    from economy_private.post_inventory_transaction_v2(
      p_game_session_id => p_game_session_id,
      p_game_item_id => v_input.input_game_item_id,
      p_from_account_id => v_warehouse,
      p_to_account_id => v_wip,
      p_quantity => v_input.quantity_per_batch * v_batches,
      p_unit_cost => null,
      p_transaction_kind => 'transfer',
      p_source_domain => 'business',
      p_source_action => 'production_reserve',
      p_source_id => v_job.id,
      p_idempotency_key => 'production-reserve:' || v_job.public_key || ':' || v_input.input_game_item_id::text,
      p_metadata => jsonb_build_object(
        'business_id', v_business.id,
        'recipe_key', v_recipe.public_key,
        'production_job_key', v_job.public_key
      )
    );

    insert into public.business_production_job_inputs_v2(
      game_session_id,
      production_job_id,
      game_item_id,
      reserved_quantity,
      reservation_inventory_transaction_id
    ) values (
      p_game_session_id,
      v_job.id,
      v_input.input_game_item_id,
      v_input.quantity_per_batch * v_batches,
      v_tx
    );
  end loop;

  select item_row.* into v_output_item
  from public.game_items as item_row
  where item_row.id = v_recipe.output_game_item_id;

  insert into public.business_activity_events(
    game_session_id,
    business_id,
    actor_type,
    actor_player_id,
    event_type,
    source_id,
    reason_code,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    'player',
    p_player_id,
    'business.production.started',
    v_job.id,
    'production_started',
    jsonb_build_object(
      'jobKey', v_job.public_key,
      'recipeKey', v_recipe.public_key,
      'outputItemKey', v_output_item.public_key,
      'quantity', p_quantity,
      'completionAt', v_job.completion_at
    )
  );

  return query select
    v_job.public_key,
    v_job.status,
    v_output_item.public_key,
    v_job.requested_output_quantity,
    v_job.completion_at,
    false;
end
$function$;

revoke all on function public.start_business_production_v2(
  uuid, uuid, text, text, integer, text
) from public, anon, authenticated;
grant execute on function public.start_business_production_v2(
  uuid, uuid, text, text, integer, text
) to service_role;

commit;
