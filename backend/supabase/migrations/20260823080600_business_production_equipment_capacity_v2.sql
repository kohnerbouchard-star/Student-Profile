-- Business V2 Phase 5B: enforce installed canonical equipment capacity in the
-- current instant-production transaction. Phase 6 will later retain the same
-- reservation authority across server-timed manufacturing jobs.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.business_production_runs
  add column if not exists reserved_equipment_minutes integer not null default 0,
  add column if not exists equipment_authority_mode text not null default 'not_required';

alter table public.business_production_runs
  add constraint business_production_runs_reserved_equipment_valid
    check (reserved_equipment_minutes >= 0),
  add constraint business_production_runs_equipment_authority_mode_valid
    check (equipment_authority_mode in ('not_required','canonical_equipment_v2')),
  add constraint business_production_runs_equipment_authority_state_valid
    check (
      (equipment_authority_mode = 'not_required' and reserved_equipment_minutes = 0)
      or (equipment_authority_mode = 'canonical_equipment_v2' and reserved_equipment_minutes > 0)
    );

comment on column public.business_production_runs.reserved_equipment_minutes is
  'Finite installed-equipment minutes consumed by this production run in its current capacity period.';
comment on column public.business_production_runs.equipment_authority_mode is
  'canonical_equipment_v2 means production satisfied explicit canonical-recipe equipment requirements.';

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
  v_requirement record;
  v_equipment record;
  v_result record;
  v_period_key text;
  v_intent_ref text;
  v_required_total integer := 0;
  v_required_remaining integer := 0;
  v_instance_remaining integer := 0;
  v_instance_count integer := 0;
  v_available_capacity integer := 0;
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

  select run.* into v_existing_run
  from public.business_production_runs as run
  where run.game_session_id = p_game_session_id
    and run.requested_by_player_id = p_player_id
    and run.idempotency_key = p_idempotency_key
  for share;
  if found then
    return query
    select base.run_key, base.status, base.output_quantity, base.total_cost, base.business_balance, base.replayed
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

  select business.* into v_business
  from public.business_entities as business
  where business.game_session_id = p_game_session_id
    and business.public_key = lower(btrim(p_business_key))
    and business.owner_player_id = p_player_id
    and business.status = 'active'
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select product.* into v_product
  from public.business_products as product
  where product.game_session_id = p_game_session_id
    and product.business_id = v_business.id
    and product.public_key = lower(btrim(p_product_key))
    and product.status = 'active'
  for share;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

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
    from public.business_recipe_equipment_requirements as requirement
    where requirement.recipe_definition_id = v_recipe_id
      and requirement.status = 'active';
  end if;

  if v_recipe_id is null or v_requirement_count = 0 then
    return query
    select base.run_key, base.status, base.output_quantity, base.total_cost, base.business_balance, base.replayed
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

  v_period_key := public.current_business_payroll_period_key_v2(p_game_session_id, v_business.id);
  v_intent_ref := 'prod-eqp:' || substr(
    encode(
      extensions.digest(
        concat_ws('|', p_game_session_id, p_player_id, v_business.id, v_product.id, p_idempotency_key),
        'sha256'
      ),
      'hex'
    ),
    1,
    48
  );

  for v_requirement in
    select requirement.*
    from public.business_recipe_equipment_requirements as requirement
    where requirement.recipe_definition_id = v_recipe_id
      and requirement.status = 'active'
    order by requirement.capability_key, requirement.public_key
  loop
    v_required_total := v_requirement.fixed_equipment_minutes_per_run
      + v_requirement.equipment_minutes_per_unit * p_quantity;
    if v_required_total <= 0 or v_required_total < v_requirement.minimum_instances then
      raise exception 'BUSINESS_EQUIPMENT_REQUIREMENT_INVALID:%', v_requirement.capability_key
        using errcode = 'P0001';
    end if;

    select
      count(*)::integer,
      coalesce(sum(eligible.available_minutes), 0)::integer
    into v_instance_count, v_available_capacity
    from (
      select greatest(
        equipment.capacity_minutes_per_cycle - coalesce(usage.used_minutes, 0),
        0
      )::integer as available_minutes
      from public.equipment_instances as equipment
      join public.economic_parties as party
        on party.game_session_id = equipment.game_session_id
       and party.id = equipment.owner_party_id
       and party.party_kind = 'business'
       and party.business_id = v_business.id
       and party.status = 'active'
      join public.business_equipment_installations as installation
        on installation.game_session_id = equipment.game_session_id
       and installation.business_id = v_business.id
       and installation.equipment_instance_id = equipment.id
       and installation.status = 'installed'
      join public.game_items as item
        on item.game_session_id = equipment.game_session_id
       and item.id = equipment.game_item_id
       and item.status = 'active'
      join public.physical_economy_item_definitions as definition
        on definition.id = item.physical_item_definition_id
      left join lateral (
        select coalesce(sum(reservation.reserved_minutes), 0)::integer as used_minutes
        from public.business_equipment_reservations as reservation
        where reservation.game_session_id = p_game_session_id
          and reservation.equipment_instance_id = equipment.id
          and reservation.period_key = v_period_key
          and reservation.status in ('reserved','active','consumed')
      ) as usage on true
      where equipment.game_session_id = p_game_session_id
        and equipment.status = 'active'
        and equipment.operational_status = 'operational'
        and (
          lower(definition.item_key) = v_requirement.capability_key
          or exists (
            select 1
            from unnest(definition.tool_tags) as tag(value)
            where lower(btrim(tag.value)) = v_requirement.capability_key
          )
        )
    ) as eligible
    where eligible.available_minutes > 0;

    if v_instance_count < v_requirement.minimum_instances then
      raise exception 'BUSINESS_EQUIPMENT_COVERAGE_UNAVAILABLE:%', v_requirement.capability_key
        using errcode = 'P0001';
    end if;
    if v_available_capacity < v_required_total then
      raise exception 'BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE:%', v_requirement.capability_key
        using errcode = 'P0001';
    end if;

    v_required_remaining := v_required_total;
    v_instance_remaining := v_requirement.minimum_instances;

    for v_equipment in
      select
        equipment.public_id as equipment_key,
        greatest(
          equipment.capacity_minutes_per_cycle - coalesce(usage.used_minutes, 0),
          0
        )::integer as available_minutes
      from public.equipment_instances as equipment
      join public.economic_parties as party
        on party.game_session_id = equipment.game_session_id
       and party.id = equipment.owner_party_id
       and party.party_kind = 'business'
       and party.business_id = v_business.id
       and party.status = 'active'
      join public.business_equipment_installations as installation
        on installation.game_session_id = equipment.game_session_id
       and installation.business_id = v_business.id
       and installation.equipment_instance_id = equipment.id
       and installation.status = 'installed'
      join public.game_items as item
        on item.game_session_id = equipment.game_session_id
       and item.id = equipment.game_item_id
       and item.status = 'active'
      join public.physical_economy_item_definitions as definition
        on definition.id = item.physical_item_definition_id
      left join lateral (
        select coalesce(sum(reservation.reserved_minutes), 0)::integer as used_minutes
        from public.business_equipment_reservations as reservation
        where reservation.game_session_id = p_game_session_id
          and reservation.equipment_instance_id = equipment.id
          and reservation.period_key = v_period_key
          and reservation.status in ('reserved','active','consumed')
      ) as usage on true
      where equipment.game_session_id = p_game_session_id
        and equipment.status = 'active'
        and equipment.operational_status = 'operational'
        and (
          lower(definition.item_key) = v_requirement.capability_key
          or exists (
            select 1
            from unnest(definition.tool_tags) as tag(value)
            where lower(btrim(tag.value)) = v_requirement.capability_key
          )
        )
      order by equipment.public_id
      for update of equipment
    loop
      exit when v_required_remaining <= 0;
      if v_equipment.available_minutes <= 0 then
        continue;
      end if;

      if v_instance_remaining > 0 then
        v_allocate := least(
          v_equipment.available_minutes,
          greatest(1, v_required_remaining - (v_instance_remaining - 1))
        );
      else
        v_allocate := least(v_equipment.available_minutes, v_required_remaining);
      end if;

      if v_allocate <= 0 then
        continue;
      end if;

      perform public.reserve_business_equipment_v2(
        p_game_session_id,
        v_business.public_key,
        v_equipment.equipment_key,
        v_requirement.public_key,
        v_period_key,
        v_intent_ref,
        v_allocate
      );
      v_reserved_total := v_reserved_total + v_allocate;
      v_required_remaining := v_required_remaining - v_allocate;
      if v_instance_remaining > 0 then
        v_instance_remaining := v_instance_remaining - 1;
      end if;
    end loop;

    if v_required_remaining <> 0 or v_instance_remaining <> 0 then
      raise exception 'BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE:%', v_requirement.capability_key
        using errcode = 'P0001';
    end if;
  end loop;

  select base.* into v_result
  from public.run_business_production_labor_v2(
    p_game_session_id,
    p_player_id,
    p_business_key,
    p_product_key,
    p_quantity,
    p_priority,
    p_idempotency_key
  ) as base;

  select run.id into v_run_id
  from public.business_production_runs as run
  where run.game_session_id = p_game_session_id
    and run.business_id = v_business.id
    and run.public_key = v_result.run_key
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_PRODUCTION_RUN_NOT_FOUND' using errcode = 'P0001';
  end if;

  for v_equipment in
    select reservation.public_key as reservation_key
    from public.business_equipment_reservations as reservation
    where reservation.game_session_id = p_game_session_id
      and reservation.business_id = v_business.id
      and reservation.period_key = v_period_key
      and reservation.intent_kind = 'production'
      and reservation.intent_ref = v_intent_ref
      and reservation.status in ('reserved','active')
    order by reservation.public_key
    for update of reservation
  loop
    perform public.consume_business_equipment_reservation_v2(
      p_game_session_id,
      v_equipment.reservation_key,
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

revoke all on function public.run_business_production_v1(uuid,uuid,text,text,integer,text,text) from public, anon, authenticated;
grant execute on function public.run_business_production_v1(uuid,uuid,text,text,integer,text,text) to service_role;

commit;
