-- Business V2 Phase 5B: connect canonical installed-equipment capacity to the
-- existing instant production transaction. Equipment is reserved before the
-- production authority executes and consumed exactly once on committed success.
-- Timed manufacturing remains Phase 6.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.business_production_runs
  add column if not exists reserved_equipment_minutes integer not null default 0,
  add column if not exists equipment_authority_mode text not null default 'not_required';

alter table public.business_production_runs
  add constraint business_production_runs_reserved_equipment_minutes_check
    check (reserved_equipment_minutes >= 0),
  add constraint business_production_runs_equipment_authority_mode_check
    check (equipment_authority_mode in ('not_required','canonical_equipment_v2')),
  add constraint business_production_runs_equipment_authority_state_check
    check (
      (equipment_authority_mode = 'not_required' and reserved_equipment_minutes = 0)
      or (
        equipment_authority_mode = 'canonical_equipment_v2'
        and reserved_equipment_minutes > 0
      )
    );

comment on column public.business_production_runs.reserved_equipment_minutes is
  'Finite canonical Business-equipment minutes consumed by this completed production run.';
comment on column public.business_production_runs.equipment_authority_mode is
  'canonical_equipment_v2 means explicit canonical recipe equipment requirements were satisfied.';

alter function public.run_business_production_v1(
  uuid, uuid, text, text, integer, text, text
) rename to run_business_production_labor_v2;

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
  v_existing_run public.business_production_runs%rowtype;
  v_recipe_id uuid;
  v_recipe_matches integer := 0;
  v_requirement_count integer := 0;
  v_requirement public.business_recipe_equipment_requirements%rowtype;
  v_candidate record;
  v_result record;
  v_period_key text;
  v_intent_ref text;
  v_reservation_idempotency text;
  v_required_total integer := 0;
  v_required_remaining integer := 0;
  v_instances_remaining integer := 0;
  v_instances_used integer := 0;
  v_used_minutes integer := 0;
  v_available_minutes integer := 0;
  v_allocate integer := 0;
  v_reserved_total integer := 0;
  v_run_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity > 10000 then
    raise exception 'PRODUCTION_QUANTITY_INVALID' using errcode = 'P0001';
  end if;
  if p_priority not in ('standard','expedite') then
    raise exception 'PRODUCTION_PRIORITY_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_INVALID' using errcode = 'P0001';
  end if;

  -- Production replay must never reserve equipment again.
  select run_row.*
  into v_existing_run
  from public.business_production_runs as run_row
  where run_row.game_session_id = p_game_session_id
    and run_row.requested_by_player_id = p_player_id
    and run_row.idempotency_key = p_idempotency_key
  for share;
  if found then
    return query
    select base.run_key, base.status, base.output_quantity,
      base.total_cost, base.business_balance, base.replayed
    from public.run_business_production_labor_v2(
      p_game_session_id,
      p_player_id,
      p_business_key,
      p_product_key,
      p_quantity,
      p_priority,
      p_idempotency_key
    ) as base;
    return;
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.owner_player_id = p_player_id
    and business_row.status = 'active'
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select product_row.*
  into v_product
  from public.business_products as product_row
  where product_row.game_session_id = p_game_session_id
    and product_row.business_id = v_business.id
    and product_row.public_key = lower(btrim(p_product_key))
    and product_row.status = 'active'
  for share;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Match the same canonical recipe authority used by Phase 4 labor.
  if v_product.product_kind = 'physical_good'
    and v_product.output_game_item_id is not null
  then
    select count(distinct recipe.id)::integer
    into v_recipe_matches
    from public.business_recipe_access as access
    join public.physical_economy_recipe_definitions as recipe
      on recipe.id = access.recipe_id
     and recipe.status = 'active'
    join public.physical_economy_recipe_outputs as recipe_output
      on recipe_output.recipe_id = recipe.id
    join public.game_items as output_item
      on output_item.game_session_id = access.game_session_id
     and output_item.canonical_key = recipe_output.item_key
     and output_item.id = v_product.output_game_item_id
     and output_item.status = 'active'
    join public.game_session_recipe_availability as availability
      on availability.game_session_id = access.game_session_id
     and availability.recipe_id = recipe.id
     and availability.enabled = true
    join public.game_session_physical_economy_packs as pack_scope
      on pack_scope.game_session_id = access.game_session_id
     and pack_scope.pack_id = recipe.pack_id
     and pack_scope.status = 'active'
    where access.game_session_id = p_game_session_id
      and access.business_id = v_business.id
      and access.revoked_at is null
      and (
        cardinality(availability.country_codes) = 0
        or v_business.country_code = any(availability.country_codes)
      );

    if v_recipe_matches > 1 then
      raise exception 'BUSINESS_PRODUCTION_RECIPE_AMBIGUOUS' using errcode = 'P0001';
    end if;

    if v_recipe_matches = 1 then
      select recipe.id
      into v_recipe_id
      from public.business_recipe_access as access
      join public.physical_economy_recipe_definitions as recipe
        on recipe.id = access.recipe_id
       and recipe.status = 'active'
      join public.physical_economy_recipe_outputs as recipe_output
        on recipe_output.recipe_id = recipe.id
      join public.game_items as output_item
        on output_item.game_session_id = access.game_session_id
       and output_item.canonical_key = recipe_output.item_key
       and output_item.id = v_product.output_game_item_id
       and output_item.status = 'active'
      join public.game_session_recipe_availability as availability
        on availability.game_session_id = access.game_session_id
       and availability.recipe_id = recipe.id
       and availability.enabled = true
      join public.game_session_physical_economy_packs as pack_scope
        on pack_scope.game_session_id = access.game_session_id
       and pack_scope.pack_id = recipe.pack_id
       and pack_scope.status = 'active'
      where access.game_session_id = p_game_session_id
        and access.business_id = v_business.id
        and access.revoked_at is null
        and (
          cardinality(availability.country_codes) = 0
          or v_business.country_code = any(availability.country_codes)
        )
      order by recipe.recipe_key
      limit 1;
    end if;
  end if;

  if v_recipe_id is not null then
    select count(*)::integer
    into v_requirement_count
    from public.business_recipe_equipment_requirements as requirement_row
    where requirement_row.recipe_definition_id = v_recipe_id
      and requirement_row.status = 'active';
  end if;

  -- Recipes without equipment requirements preserve the certified Phase 4 path.
  if v_recipe_id is null or v_requirement_count = 0 then
    return query
    select base.run_key, base.status, base.output_quantity,
      base.total_cost, base.business_balance, base.replayed
    from public.run_business_production_labor_v2(
      p_game_session_id,
      p_player_id,
      p_business_key,
      p_product_key,
      p_quantity,
      p_priority,
      p_idempotency_key
    ) as base;
    return;
  end if;

  v_period_key := public.current_business_equipment_period_key_v2(
    p_game_session_id,
    v_business.id
  );
  v_intent_ref := 'production:' || substr(
    encode(
      extensions.digest(
        concat_ws(
          '|', p_game_session_id, p_player_id, v_business.id,
          v_product.id, p_quantity, p_priority, p_idempotency_key
        ),
        'sha256'
      ),
      'hex'
    ),
    1,
    48
  );

  for v_requirement in
    select requirement_row.*
    from public.business_recipe_equipment_requirements as requirement_row
    where requirement_row.recipe_definition_id = v_recipe_id
      and requirement_row.status = 'active'
    order by requirement_row.capability_key, requirement_row.public_key
  loop
    v_required_total := v_requirement.fixed_equipment_minutes_per_run
      + v_requirement.equipment_minutes_per_unit * p_quantity;
    if v_required_total <= 0
      or v_required_total < v_requirement.minimum_instance_count
    then
      raise exception 'BUSINESS_EQUIPMENT_REQUIREMENT_INVALID:%',
        v_requirement.capability_key using errcode = 'P0001';
    end if;

    v_required_remaining := v_required_total;
    v_instances_remaining := v_requirement.minimum_instance_count;
    v_instances_used := 0;

    for v_candidate in
      select
        installation.id as installation_id,
        installation.public_key as installation_key,
        instance.id as instance_id,
        instance.public_id as equipment_key,
        profile.base_capacity_minutes_per_period as capacity_minutes
      from public.business_equipment_installations as installation
      join public.equipment_instances as instance
        on instance.game_session_id = installation.game_session_id
       and instance.id = installation.equipment_instance_id
       and instance.status = 'active'
       and instance.player_id is null
       and instance.equipped_slot is null
      join public.business_equipment_capacity_profiles as profile
        on profile.id = installation.capacity_profile_id
       and profile.status = 'active'
      where installation.game_session_id = p_game_session_id
        and installation.business_id = v_business.id
        and installation.status = 'installed'
        and v_requirement.capability_key = any(profile.capability_keys)
      order by installation.public_key
    loop
      exit when v_required_remaining <= 0 and v_instances_remaining <= 0;

      -- Serialize each candidate before calculating remaining capacity.
      perform 1
      from public.business_equipment_installations as locked_installation
      join public.equipment_instances as locked_instance
        on locked_instance.game_session_id = locked_installation.game_session_id
       and locked_instance.id = locked_installation.equipment_instance_id
      where locked_installation.id = v_candidate.installation_id
        and locked_installation.game_session_id = p_game_session_id
        and locked_installation.status = 'installed'
        and locked_instance.status = 'active'
      for update of locked_installation, locked_instance;
      if not found then
        continue;
      end if;

      select coalesce(sum(reservation.reserved_minutes), 0)::integer
      into v_used_minutes
      from public.business_equipment_reservations as reservation
      where reservation.game_session_id = p_game_session_id
        and reservation.installation_id = v_candidate.installation_id
        and reservation.period_key = v_period_key
        and reservation.status in ('reserved','active','consumed');

      v_available_minutes := greatest(
        v_candidate.capacity_minutes - v_used_minutes,
        0
      );
      if v_available_minutes <= 0 then
        continue;
      end if;

      if v_instances_remaining > 0 then
        v_allocate := least(
          v_available_minutes,
          greatest(1, v_required_remaining - (v_instances_remaining - 1))
        );
      else
        v_allocate := least(v_available_minutes, v_required_remaining);
      end if;
      if v_allocate <= 0 then
        continue;
      end if;

      v_reservation_idempotency := 'equipment:' || substr(
        encode(
          extensions.digest(
            concat_ws(
              '|', p_game_session_id, v_business.id,
              v_requirement.id, v_candidate.installation_id,
              v_period_key, v_intent_ref, v_allocate
            ),
            'sha256'
          ),
          'hex'
        ),
        1,
        48
      );

      perform public.reserve_business_equipment_v2(
        p_game_session_id,
        v_business.public_key,
        v_candidate.installation_key,
        v_requirement.public_key,
        v_period_key,
        v_allocate,
        v_intent_ref,
        v_reservation_idempotency
      );

      v_reserved_total := v_reserved_total + v_allocate;
      v_required_remaining := greatest(v_required_remaining - v_allocate, 0);
      if v_instances_remaining > 0 then
        v_instances_remaining := v_instances_remaining - 1;
      end if;
      v_instances_used := v_instances_used + 1;
    end loop;

    if v_instances_used < v_requirement.minimum_instance_count then
      raise exception 'BUSINESS_EQUIPMENT_COVERAGE_UNAVAILABLE:%',
        v_requirement.capability_key using errcode = 'P0001';
    end if;
    if v_required_remaining > 0 then
      raise exception 'BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE:%',
        v_requirement.capability_key using errcode = 'P0001';
    end if;
  end loop;

  -- Material, labor, ledger, and output settlement remain the certified Phase 4
  -- authority. Any failure rolls this transaction back, including reservations.
  select base.*
  into v_result
  from public.run_business_production_labor_v2(
    p_game_session_id,
    p_player_id,
    p_business_key,
    p_product_key,
    p_quantity,
    p_priority,
    p_idempotency_key
  ) as base;

  select run_row.id
  into v_run_id
  from public.business_production_runs as run_row
  where run_row.game_session_id = p_game_session_id
    and run_row.business_id = v_business.id
    and run_row.public_key = v_result.run_key
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_PRODUCTION_RUN_NOT_FOUND' using errcode = 'P0001';
  end if;

  for v_candidate in
    select reservation.public_key as reservation_key
    from public.business_equipment_reservations as reservation
    where reservation.game_session_id = p_game_session_id
      and reservation.business_id = v_business.id
      and reservation.period_key = v_period_key
      and reservation.intent_ref = v_intent_ref
      and reservation.status in ('reserved','active')
    order by reservation.public_key
    for update of reservation
  loop
    perform public.transition_business_equipment_reservation_v2(
      p_game_session_id,
      v_candidate.reservation_key,
      'consumed',
      v_result.run_key
    );
  end loop;

  update public.business_production_runs
  set
    reserved_equipment_minutes = v_reserved_total,
    equipment_authority_mode = 'canonical_equipment_v2'
  where id = v_run_id;

  return query select
    v_result.run_key::text,
    v_result.status::text,
    v_result.output_quantity::integer,
    v_result.total_cost::numeric,
    v_result.business_balance::numeric,
    v_result.replayed::boolean;
end
$function$;

revoke all on function public.run_business_production_v1(
  uuid, uuid, text, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.run_business_production_v1(
  uuid, uuid, text, text, integer, text, text
) to service_role;

commit;
