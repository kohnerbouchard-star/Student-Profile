-- Repair reproduced canonical manufacturing runtime/schema mismatches.
-- Preserves policy, funding and scheduling; widens only the legacy unit-cost projection.
-- Every projection refresh derives solely from locked canonical holdings.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- This is a compatibility projection refresh, not a second inventory posting.
-- The canonical holding is locked through both the read and compatibility
-- trigger, so a concurrent stock/completion cannot be overwritten with stale data.
-- PostgreSQL requires rebuilding these column-specific trigger dependencies.
-- The same definitions are restored inside this transaction before any caller can run.
drop trigger assign_business_inventory_context_v2 on public.business_inventory;
drop trigger project_business_inventory_v2 on public.business_inventory;
alter table public.business_inventory alter column unit_cost type numeric(16,4);
create trigger assign_business_inventory_context_v2
before insert or update of game_session_id, business_id, item_key, inventory_kind, quantity, unit_cost, inventory_account_id, game_item_id
on public.business_inventory for each row execute function economy_private.assign_business_inventory_context_v2();
create trigger project_business_inventory_v2
after insert or update of quantity, unit_cost, inventory_account_id, game_item_id
on public.business_inventory for each row execute function economy_private.project_business_inventory_v2();

create or replace function economy_private.refresh_manufacturing_inventory_projection_v1(
  p_game_session_id uuid, p_business_id uuid,
  p_inventory_account_id uuid, p_game_item_id uuid
) returns void language plpgsql security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_holding public.inventory_holdings%rowtype;
  v_after public.inventory_holdings%rowtype;
  v_projection public.business_inventory%rowtype;
  v_kind text;
  v_item_key text;
  v_currency text;
begin
  select case account.account_kind when 'warehouse' then 'input'
    when 'work_in_progress' then 'work_in_progress'
    when 'finished_goods' then 'finished_good' end,
    'manufacturing.' || account.account_kind || '.' || item.public_key,
    business.currency_code
  into v_kind, v_item_key, v_currency
  from public.inventory_accounts account
  join public.economic_parties party on party.id=account.party_id and party.game_session_id=account.game_session_id
  join public.business_entities business on business.id=party.business_id and business.game_session_id=party.game_session_id
  join public.game_items item on item.id=p_game_item_id and item.game_session_id=account.game_session_id
  where account.game_session_id=p_game_session_id and account.id=p_inventory_account_id and account.status='active'
    and party.party_kind='business' and party.business_id=p_business_id and party.status='active';
  if v_kind is null then raise exception 'BUSINESS_MANUFACTURING_PROJECTION_SCOPE_INVALID'; end if;

  select holding.* into v_holding from public.inventory_holdings holding
  where holding.game_session_id=p_game_session_id and holding.inventory_account_id=p_inventory_account_id
    and holding.game_item_id=p_game_item_id for update;
  if not found or v_holding.cost_currency_code is distinct from v_currency then
    raise exception 'BUSINESS_MANUFACTURING_PROJECTION_HOLDING_INVALID';
  end if;

  select projection.* into v_projection from public.business_inventory projection
  where projection.game_session_id=p_game_session_id and projection.business_id=p_business_id
    and projection.game_item_id=p_game_item_id and projection.inventory_kind=v_kind for update;
  if found then
    if v_projection.inventory_account_id is distinct from p_inventory_account_id then
      raise exception 'BUSINESS_MANUFACTURING_PROJECTION_ACCOUNT_CONFLICT';
    end if;
    update public.business_inventory set quantity=v_holding.quantity_owned,
      unit_cost=v_holding.average_unit_cost,
      total_cost_basis=round(v_holding.quantity_owned*v_holding.average_unit_cost,4),
      version=version+1, updated_at=now()
    where id=v_projection.id;
  else
    insert into public.business_inventory(game_session_id,business_id,item_key,inventory_kind,quantity,unit_cost,total_cost_basis,game_item_id,inventory_account_id)
    values(p_game_session_id,p_business_id,v_item_key,v_kind,v_holding.quantity_owned,v_holding.average_unit_cost,
      round(v_holding.quantity_owned*v_holding.average_unit_cost,4),p_game_item_id,p_inventory_account_id);
  end if;

  select holding.* into v_after from public.inventory_holdings holding
  where holding.game_session_id=p_game_session_id and holding.inventory_account_id=p_inventory_account_id
    and holding.game_item_id=p_game_item_id;
  if v_after.quantity_owned is distinct from v_holding.quantity_owned
    or v_after.quantity_reserved is distinct from v_holding.quantity_reserved
    or v_after.average_unit_cost is distinct from v_holding.average_unit_cost
    or v_after.cost_currency_code is distinct from v_holding.cost_currency_code
  then raise exception 'BUSINESS_MANUFACTURING_PROJECTION_CHANGED_CANONICAL_HOLDING'; end if;
end $function$;
revoke all on function economy_private.refresh_manufacturing_inventory_projection_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;


-- Start retains an exclusive Business mutation lock. Acquire it immediately,
-- rather than upgrading a shared authority lock while another start does likewise.
create or replace function private.lock_business_manufacturing_start_authority_v1(
  p_game_session_id uuid, p_player_id uuid, p_business_key text
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare v_business_id uuid; v_owned record;
begin
  perform 1 from public.game_sessions where id = p_game_session_id and status = 'active' and lifecycle_state = 'active' for share;
  if not found then raise exception 'GAME_SESSION_NOT_ACTIVE'; end if;
  perform 1 from public.players where game_session_id = p_game_session_id and id = p_player_id and status = 'active' for share;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select id into v_business_id from public.business_entities
    where game_session_id = p_game_session_id and public_key = p_business_key and status = 'active' for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;
  select * into v_owned from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  if v_owned.business_id is distinct from v_business_id then raise exception 'BUSINESS_NOT_FOUND'; end if;
  return v_business_id;
end $function$;
revoke all on function private.lock_business_manufacturing_start_authority_v1(uuid,uuid,text) from public, anon, authenticated, service_role;

create or replace function public.claim_due_business_manufacturing_jobs_v2(
  p_game_session_id uuid,
  p_batch_size integer default 10,
  p_lease_seconds integer default 90
)
returns table (
  job_id uuid,
  job_key text,
  business_id uuid,
  recipe_definition_id uuid,
  output_game_item_id uuid,
  quantity integer,
  lease_token uuid,
  lease_expires_at timestamptz,
  completion_attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_job public.business_manufacturing_jobs%rowtype;
  v_claimed public.business_manufacturing_jobs%rowtype;
begin
  if p_game_session_id is null
    or p_batch_size is null
    or p_batch_size not between 1 and 50
    or p_lease_seconds is null
    or p_lease_seconds not between 30 and 600
  then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_CLAIM_INVALID'
      using errcode = 'P0001';
  end if;

  for v_job in
    select job_row.*
    from public.business_manufacturing_jobs as job_row
    where job_row.game_session_id = p_game_session_id
      and job_row.status = 'in_progress'
      and job_row.resource_state = 'reserved'
      and job_row.completes_at <= v_now
      and job_row.completion_next_attempt_at <= v_now
      and job_row.completion_attempt_count < job_row.completion_max_attempts
      and (
        job_row.completion_lease_token is null
        or job_row.completion_lease_expires_at <= v_now
      )
    order by job_row.completes_at, job_row.public_key
    for update skip locked
    limit p_batch_size
  loop
    update public.business_manufacturing_jobs as claimed_job
    set
      completion_attempt_count = claimed_job.completion_attempt_count + 1,
      completion_lease_token = extensions.gen_random_uuid(),
      completion_lease_expires_at = v_now + make_interval(secs => p_lease_seconds)
    where id = v_job.id
      and game_session_id = p_game_session_id
      and status = 'in_progress'
    returning * into v_claimed;

    if v_claimed.id is null then
      continue;
    end if;

    job_id := v_claimed.id;
    job_key := v_claimed.public_key;
    business_id := v_claimed.business_id;
    recipe_definition_id := v_claimed.recipe_definition_id;
    output_game_item_id := v_claimed.output_game_item_id;
    quantity := v_claimed.quantity;
    lease_token := v_claimed.completion_lease_token;
    lease_expires_at := v_claimed.completion_lease_expires_at;
    completion_attempt_count := v_claimed.completion_attempt_count;
    return next;
  end loop;
end
$function$;

create or replace function public.start_business_manufacturing_job_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_product_key text,
  p_quantity integer,
  p_priority text,
  p_idempotency_key text
)
returns table (
  business_key text,
  job_key text,
  status text,
  quantity integer,
  duration_seconds integer,
  queued_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, extensions, pg_temp
as $function$
declare
  v_business record;
  v_business_row public.business_entities%rowtype;
  v_product public.business_products%rowtype;
  v_recipe public.physical_economy_recipe_definitions%rowtype;
  v_recipe_matches integer := 0;
  v_party public.economic_parties%rowtype;
  v_warehouse public.inventory_accounts%rowtype;
  v_wip public.inventory_accounts%rowtype;
  v_job public.business_manufacturing_jobs%rowtype;
  v_input public.physical_economy_recipe_inputs%rowtype;
  v_item public.game_items%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_inventory_post jsonb;
  v_required integer;
  v_hash text;
  v_intent_ref text;
  v_period_key text;
  v_equipment_period_key text;
  v_requirement record;
  v_employee record;
  v_candidate record;
  v_reservation record;
  v_used integer := 0;
  v_available integer := 0;
  v_allocate integer := 0;
  v_remaining integer := 0;
  v_headcount_remaining integer := 0;
  v_headcount_used integer := 0;
  v_reservation_hash text;
  v_reservation_idempotency text;
  v_duration integer;
  v_now timestamptz := statement_timestamp();
begin
  if p_game_session_id is null
    or p_player_id is null
    or coalesce(p_business_key, '') !~ '^biz_[0-9a-f]{32}$'
    or coalesce(p_product_key, '') !~ '^bpr_[0-9a-f]{32}$'
    or p_quantity is null
    or p_quantity not between 1 and 10000
    or lower(btrim(coalesce(p_priority, ''))) not in ('standard','expedite')
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160
  then
    raise exception 'BUSINESS_MANUFACTURING_START_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

  perform private.lock_business_manufacturing_start_authority_v1(
    p_game_session_id, p_player_id, p_business_key
  );

  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  if v_business.business_key is distinct from lower(btrim(p_business_key)) then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business_row
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_business.business_id
    and business_row.status = 'active'
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select product_row.*
  into v_product
  from public.business_products as product_row
  where product_row.game_session_id = p_game_session_id
    and product_row.business_id = v_business.business_id
    and product_row.public_key = lower(btrim(p_product_key))
    and product_row.product_kind = 'physical_good'
    and product_row.output_game_item_id is not null
    and product_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_PRODUCT_INVALID'
      using errcode = 'P0001';
  end if;

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
   and availability.scarcity_band <> 'unavailable'
  join public.game_session_physical_economy_packs as pack_scope
    on pack_scope.game_session_id = access.game_session_id
   and pack_scope.pack_id = recipe.pack_id
   and pack_scope.status = 'active'
  where access.game_session_id = p_game_session_id
    and access.business_id = v_business.business_id
    and access.revoked_at is null
    and (
      cardinality(availability.country_codes) = 0
      or v_business_row.country_code = any(availability.country_codes)
    );

  if v_recipe_matches <> 1 then
    if v_recipe_matches = 0 then
      raise exception 'BUSINESS_MANUFACTURING_RECIPE_UNAVAILABLE'
        using errcode = 'P0001';
    end if;
    raise exception 'BUSINESS_PRODUCTION_RECIPE_AMBIGUOUS'
      using errcode = 'P0001';
  end if;

  select recipe.*
  into v_recipe
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
   and availability.scarcity_band <> 'unavailable'
  where access.game_session_id = p_game_session_id
    and access.business_id = v_business.business_id
    and access.revoked_at is null
    and (
      cardinality(availability.country_codes) = 0
      or v_business_row.country_code = any(availability.country_codes)
    )
  order by recipe.recipe_key
  limit 1;

  v_hash := encode(
    extensions.digest(
      concat_ws(
        '|', p_game_session_id, p_player_id, v_business.business_id,
        v_product.id, v_recipe.id, v_product.output_game_item_id, p_quantity,
        lower(btrim(p_priority))
      ),
      'sha256'
    ),
    'hex'
  );

  select job_row.*
  into v_job
  from public.business_manufacturing_jobs as job_row
  where job_row.game_session_id = p_game_session_id
    and job_row.requested_by_player_id = p_player_id
    and job_row.idempotency_key = btrim(p_idempotency_key)
  for update;
  if found then
    if v_job.request_hash <> v_hash then
      raise exception 'BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    return query select
      v_business.business_key,
      v_job.public_key,
      v_job.status,
      v_job.quantity,
      v_job.duration_seconds,
      v_job.created_at,
      true;
    return;
  end if;

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.party_kind = 'business'
    and party_row.business_id = v_business.business_id
    and party_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_PARTY_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_warehouse
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.party_id = v_party.id
    and account_row.status = 'active'
    and (
      account_row.account_kind = 'warehouse'
      or lower(coalesce(account_row.location_key, '')) in ('warehouse','materials')
    )
  order by
    case when account_row.account_kind = 'warehouse' then 0 else 1 end,
    account_row.id
  limit 1
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_WAREHOUSE_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_wip
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.party_id = v_party.id
    and account_row.status = 'active'
    and (
      account_row.account_kind = 'work_in_progress'
      or lower(coalesce(account_row.location_key, '')) in ('work_in_progress','wip')
    )
  order by
    case when account_row.account_kind = 'work_in_progress' then 0 else 1 end,
    account_row.id
  limit 1
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_WIP_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  v_duration := public.derive_business_manufacturing_duration_seconds_v2(
    p_game_session_id,
    v_business.business_id,
    v_recipe.id,
    p_quantity,
    lower(btrim(p_priority))
  );

  insert into public.business_manufacturing_jobs(
    id,
    public_key,
    game_session_id,
    business_id,
    product_id,
    recipe_definition_id,
    output_game_item_id,
    requested_by_player_id,
    idempotency_key,
    request_hash,
    quantity,
    priority,
    status,
    resource_state,
    duration_seconds,
    queue_available_at,
    completion_next_attempt_at
  ) values (
    gen_random_uuid(),
    'mfg_' || encode(gen_random_bytes(16), 'hex'),
    p_game_session_id,
    v_business.business_id,
    v_product.id,
    v_recipe.id,
    v_product.output_game_item_id,
    p_player_id,
    btrim(p_idempotency_key),
    v_hash,
    p_quantity,
    lower(btrim(p_priority)),
    'queued',
    'reserved',
    v_duration,
    v_now,
    v_now
  )
  returning * into v_job;

  v_intent_ref := 'manufacturing:' || substr(v_hash, 1, 48);

  for v_input in
    select input.*
    from public.physical_economy_recipe_inputs as input
    where input.recipe_id = v_recipe.id
    order by input.line_key
  loop
    v_required := ceil(v_input.base_quantity * p_quantity)::integer;
    if v_required <= 0 then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_REQUIREMENT_INVALID:%',
        v_input.line_key using errcode = 'P0001';
    end if;

    select item_row.*
    into v_item
    from public.game_items as item_row
    where item_row.game_session_id = p_game_session_id
      and item_row.canonical_key = v_input.item_key
      and item_row.status = 'active'
    for share;
    if not found then
      raise exception 'BUSINESS_MANUFACTURING_INPUT_ITEM_UNAVAILABLE:%',
        v_input.item_key using errcode = 'P0001';
    end if;

    select holding_row.*
    into v_holding
    from public.inventory_holdings as holding_row
    where holding_row.game_session_id = p_game_session_id
      and holding_row.inventory_account_id = v_warehouse.id
      and holding_row.game_item_id = v_item.id
    for update;
    if not found
      or v_holding.quantity_owned - v_holding.quantity_reserved < v_required
    then
      raise exception 'BUSINESS_MANUFACTURING_INPUT_QUANTITY_UNAVAILABLE:%:%',
        v_input.item_key, v_required using errcode = 'P0001';
    end if;

    v_inventory_post := economy_private.post_inventory_transaction_v2(
      p_game_session_id,
      'transfer',
      'business',
      'manufacturing_material_staged',
      v_job.id,
      btrim(p_idempotency_key) || ':material:' || v_input.line_key,
      jsonb_build_object(
        'businessKey', v_business.business_key,
        'jobKey', v_job.public_key,
        'recipeKey', v_recipe.recipe_key,
        'lineKey', v_input.line_key,
        'itemKey', v_item.public_key,
        'quantity', v_required
      ),
      jsonb_build_array(
        jsonb_build_object(
          'inventoryAccountId', v_warehouse.id,
          'gameItemId', v_item.id,
          'playerId', null,
          'storeItemId', v_holding.store_item_id,
          'quantityDelta', -v_required,
          'reservationDelta', 0,
          'unitCost', v_holding.average_unit_cost,
          'currencyCode', v_holding.cost_currency_code,
          'eventType', 'ADJUSTED',
          'legacyEventQuantityDelta', -v_required,
          'eventMetadata', jsonb_build_object(
            'businessKey', v_business.business_key,
            'jobKey', v_job.public_key,
            'location', 'warehouse'
          )
        ),
        jsonb_build_object(
          'inventoryAccountId', v_wip.id,
          'gameItemId', v_item.id,
          'playerId', null,
          'storeItemId', v_holding.store_item_id,
          'quantityDelta', v_required,
          'reservationDelta', 0,
          'unitCost', v_holding.average_unit_cost,
          'currencyCode', v_holding.cost_currency_code,
          'eventType', 'ADJUSTED',
          'legacyEventQuantityDelta', v_required,
          'eventMetadata', jsonb_build_object(
            'businessKey', v_business.business_key,
            'jobKey', v_job.public_key,
            'location', 'work_in_progress'
          )
        )
      )
    );

    if coalesce(v_inventory_post->>'status', '') <> 'committed' then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_POST_FAILED:%',
        v_input.line_key using errcode = 'P0001';
    end if;

    perform economy_private.refresh_manufacturing_inventory_projection_v1(p_game_session_id, v_business.business_id, v_warehouse.id, v_item.id);
    perform economy_private.refresh_manufacturing_inventory_projection_v1(p_game_session_id, v_business.business_id, v_wip.id, v_item.id);

    insert into public.business_manufacturing_job_materials(
      game_session_id,
      job_id,
      recipe_line_key,
      game_item_id,
      warehouse_account_id,
      wip_account_id,
      staged_quantity,
      staged_unit_cost,
      cost_currency_code,
      status
    ) values (
      p_game_session_id,
      v_job.id,
      v_input.line_key,
      v_item.id,
      v_warehouse.id,
      v_wip.id,
      v_required,
      coalesce(v_holding.average_unit_cost, 0),
      coalesce(v_holding.cost_currency_code, v_business_row.currency_code),
      'staged'
    );
  end loop;

  v_period_key := public.current_business_payroll_period_key_v2(
    p_game_session_id,
    v_business.business_id
  );

  for v_requirement in
    select requirement.*
    from public.business_recipe_labor_requirements as requirement
    where requirement.recipe_definition_id = v_recipe.id
      and requirement.status = 'active'
    order by requirement.public_key
  loop
    v_remaining := v_requirement.fixed_labor_minutes_per_run
      + v_requirement.labor_minutes_per_unit * p_quantity;
    v_headcount_remaining := v_requirement.minimum_headcount;
    v_headcount_used := 0;
    if v_remaining <= 0 or v_remaining < v_headcount_remaining then
      raise exception 'BUSINESS_LABOR_REQUIREMENT_INVALID'
        using errcode = 'P0001';
    end if;

    for v_employee in
      select employee.*
      from public.business_employees as employee
      where employee.game_session_id = p_game_session_id
        and employee.business_id = v_business.business_id
        and employee.status = 'active'
        and employee.workforce_source_type in ('candidate_v2','migration_v2')
        and employee.workforce_role_definition_id = v_requirement.role_definition_id
        and employee.skill_basis_points >= v_requirement.minimum_skill_basis_points
      order by employee.public_key
      for update of employee
    loop
      exit when v_remaining <= 0 and v_headcount_remaining <= 0;

      select coalesce(sum(reservation.reserved_minutes), 0)::integer
      into v_used
      from public.business_labor_reservations as reservation
      where reservation.game_session_id = p_game_session_id
        and reservation.employee_id = v_employee.id
        and reservation.period_key = v_period_key
        and reservation.status in ('reserved','active','consumed');

      v_available := greatest(v_employee.labor_minutes_per_cycle - v_used, 0);
      if v_available <= 0 then
        continue;
      end if;

      if v_headcount_remaining > 0 then
        v_allocate := least(
          v_available,
          greatest(1, v_remaining - (v_headcount_remaining - 1))
        );
      else
        v_allocate := least(v_available, v_remaining);
      end if;
      if v_allocate <= 0 then
        continue;
      end if;

      v_reservation_hash := encode(
        extensions.digest(
          concat_ws(
            '|', p_game_session_id, v_business.business_id,
            v_employee.id, v_requirement.id, v_period_key,
            v_intent_ref, v_allocate
          ),
          'sha256'
        ),
        'hex'
      );
      v_reservation_idempotency := 'manufacturing-labor:'
        || substr(v_reservation_hash, 1, 48);

      insert into public.business_labor_reservations(
        game_session_id,
        business_id,
        employee_id,
        role_definition_id,
        manufacturing_job_id,
        period_key,
        reservation_kind,
        source_reference_key,
        reserved_minutes,
        status,
        idempotency_key,
        request_hash
      ) values (
        p_game_session_id,
        v_business.business_id,
        v_employee.id,
        v_requirement.role_definition_id,
        v_job.id,
        v_period_key,
        'production_job',
        v_intent_ref,
        v_allocate,
        'reserved',
        v_reservation_idempotency,
        v_reservation_hash
      );

      v_remaining := greatest(v_remaining - v_allocate, 0);
      if v_headcount_remaining > 0 then
        v_headcount_remaining := v_headcount_remaining - 1;
      end if;
      v_headcount_used := v_headcount_used + 1;
    end loop;

    if v_remaining > 0
      or v_headcount_used < v_requirement.minimum_headcount
    then
      raise exception 'BUSINESS_MANUFACTURING_LABOR_CAPACITY_UNAVAILABLE'
        using errcode = 'P0001';
    end if;
  end loop;

  v_equipment_period_key := public.current_business_equipment_period_key_v2(
    p_game_session_id,
    v_business.business_id
  );

  for v_requirement in
    select requirement.*
    from public.business_recipe_equipment_requirements as requirement
    where requirement.recipe_definition_id = v_recipe.id
      and requirement.status = 'active'
    order by requirement.capability_key, requirement.public_key
  loop
    v_remaining := v_requirement.fixed_equipment_minutes_per_run
      + v_requirement.equipment_minutes_per_unit * p_quantity;
    v_headcount_remaining := v_requirement.minimum_instance_count;
    v_headcount_used := 0;
    if v_remaining <= 0 or v_remaining < v_headcount_remaining then
      raise exception 'BUSINESS_EQUIPMENT_REQUIREMENT_INVALID:%',
        v_requirement.capability_key using errcode = 'P0001';
    end if;

    for v_candidate in
      select
        installation.id as installation_id,
        installation.public_key as installation_key,
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
        and installation.business_id = v_business.business_id
        and installation.status = 'installed'
        and v_requirement.capability_key = any(profile.capability_keys)
      order by installation.public_key
    loop
      exit when v_remaining <= 0 and v_headcount_remaining <= 0;

      perform 1
      from public.business_equipment_installations as locked_installation
      where locked_installation.game_session_id = p_game_session_id
        and locked_installation.id = v_candidate.installation_id
        and locked_installation.status = 'installed'
      for update;
      if not found then
        continue;
      end if;

      select coalesce(sum(reservation.reserved_minutes), 0)::integer
      into v_used
      from public.business_equipment_reservations as reservation
      where reservation.game_session_id = p_game_session_id
        and reservation.installation_id = v_candidate.installation_id
        and reservation.period_key = v_equipment_period_key
        and reservation.status in ('reserved','active','consumed');

      v_available := greatest(v_candidate.capacity_minutes - v_used, 0);
      if v_available <= 0 then
        continue;
      end if;

      if v_headcount_remaining > 0 then
        v_allocate := least(
          v_available,
          greatest(1, v_remaining - (v_headcount_remaining - 1))
        );
      else
        v_allocate := least(v_available, v_remaining);
      end if;
      if v_allocate <= 0 then
        continue;
      end if;

      v_reservation_hash := encode(
        extensions.digest(
          concat_ws(
            '|', p_game_session_id, v_business.business_id,
            v_candidate.installation_id, v_requirement.id,
            v_equipment_period_key, v_intent_ref, v_allocate
          ),
          'sha256'
        ),
        'hex'
      );
      v_reservation_idempotency := 'manufacturing-equipment:'
        || substr(v_reservation_hash, 1, 48);

      select reserved.*
      into v_reservation
      from public.reserve_business_equipment_v2(
        p_game_session_id,
        v_business.business_key,
        v_candidate.installation_key,
        v_requirement.public_key,
        v_equipment_period_key,
        v_allocate,
        v_intent_ref,
        v_reservation_idempotency
      ) as reserved;

      update public.business_equipment_reservations
      set manufacturing_job_id = v_job.id
      where game_session_id = p_game_session_id
        and public_key = v_reservation.reservation_key
        and manufacturing_job_id is null;
      if not found then
        raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_BINDING_FAILED'
          using errcode = 'P0001';
      end if;

      v_remaining := greatest(v_remaining - v_allocate, 0);
      if v_headcount_remaining > 0 then
        v_headcount_remaining := v_headcount_remaining - 1;
      end if;
      v_headcount_used := v_headcount_used + 1;
    end loop;

    if v_remaining > 0
      or v_headcount_used < v_requirement.minimum_instance_count
    then
      raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_CAPACITY_UNAVAILABLE:%',
        v_requirement.capability_key using errcode = 'P0001';
    end if;
  end loop;

  insert into public.business_manufacturing_job_transitions(
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
    null,
    'queued',
    'player',
    p_player_id,
    'business.manufacturing.queued',
    'player:queue:' || v_job.public_key,
    jsonb_build_object(
      'businessKey', v_business.business_key,
      'jobKey', v_job.public_key,
      'productKey', v_product.public_key,
      'recipeKey', v_recipe.recipe_key,
      'outputItemKey', v_job.recipe_snapshot ->> 'outputItemKey',
      'quantity', v_job.quantity,
      'priority', v_job.priority,
      'durationSeconds', v_job.duration_seconds
    )
  );

  insert into public.audit_log(
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
    'business.manufacturing.queued',
    'business_manufacturing_job',
    v_job.id,
    jsonb_build_object(
      'businessKey', v_business.business_key,
      'jobKey', v_job.public_key,
      'productKey', v_product.public_key,
      'recipeKey', v_recipe.recipe_key,
      'quantity', v_job.quantity,
      'priority', v_job.priority,
      'idempotencyKey', btrim(p_idempotency_key),
      'timingAuthority', 'server_v2',
      'resourceAuthority', 'canonical_reserved_v2'
    )
  );

  set constraints validate_business_manufacturing_resources_v2 immediate;
  set constraints validate_business_manufacturing_resources_v2 deferred;

  return query select
    v_business.business_key,
    v_job.public_key,
    v_job.status,
    v_job.quantity,
    v_job.duration_seconds,
    v_job.created_at,
    false;
end
$function$;

create or replace function economy_private.validate_business_manufacturing_resources_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_job public.business_manufacturing_jobs%rowtype;
  v_expected integer;
  v_actual integer;
  v_headcount integer;
  v_requirement record;
begin
  select job_row.*
  into v_job
  from public.business_manufacturing_jobs as job_row
  where job_row.id = new.id;
  if not found or v_job.status not in ('queued','in_progress') then
    return new;
  end if;

  for v_requirement in
    select input.line_key, input.item_key, input.base_quantity
    from public.physical_economy_recipe_inputs as input
    where input.recipe_id = v_job.recipe_definition_id
    order by input.line_key
  loop
    v_expected := ceil(v_requirement.base_quantity * v_job.quantity)::integer;
    select coalesce(sum(material.staged_quantity), 0)::integer
    into v_actual
    from public.business_manufacturing_job_materials as material
    join public.game_items as item
      on item.game_session_id = material.game_session_id
     and item.id = material.game_item_id
    where material.game_session_id = v_job.game_session_id
      and material.job_id = v_job.id
      and material.recipe_line_key = v_requirement.line_key
      and item.canonical_key = v_requirement.item_key
      and material.status = 'staged';
    if v_actual <> v_expected then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_HOLD_INCOMPLETE:%:%:%',
        v_requirement.line_key, v_expected, v_actual using errcode = 'P0001';
    end if;
  end loop;

  if exists (
    select 1
    from public.business_manufacturing_job_materials as material
    left join public.physical_economy_recipe_inputs as input
      on input.recipe_id = v_job.recipe_definition_id
     and input.line_key = material.recipe_line_key
    where material.game_session_id = v_job.game_session_id
      and material.job_id = v_job.id
      and input.id is null
  ) then
    raise exception 'BUSINESS_MANUFACTURING_EXTRA_MATERIAL_HOLD'
      using errcode = 'P0001';
  end if;

  for v_requirement in
    select requirement.id, requirement.role_definition_id,
      requirement.fixed_labor_minutes_per_run,
      requirement.labor_minutes_per_unit,
      requirement.minimum_headcount
    from public.business_recipe_labor_requirements as requirement
    where requirement.recipe_definition_id = v_job.recipe_definition_id
      and requirement.status = 'active'
    order by requirement.public_key
  loop
    v_expected := v_requirement.fixed_labor_minutes_per_run
      + v_requirement.labor_minutes_per_unit * v_job.quantity;
    select
      coalesce(sum(reservation.reserved_minutes), 0)::integer,
      count(distinct reservation.employee_id)::integer
    into v_actual, v_headcount
    from public.business_labor_reservations as reservation
    where reservation.game_session_id = v_job.game_session_id
      and reservation.business_id = v_job.business_id
      and reservation.role_definition_id = v_requirement.role_definition_id
      and reservation.manufacturing_job_id = v_job.id
      and reservation.status in ('reserved','active');
    if v_actual <> v_expected
      or v_headcount < v_requirement.minimum_headcount
    then
      raise exception 'BUSINESS_MANUFACTURING_LABOR_HOLD_INCOMPLETE:%:%:%:%',
        v_requirement.id, v_expected, v_actual, v_headcount using errcode = 'P0001';
    end if;
  end loop;

  for v_requirement in
    select requirement.id,
      requirement.fixed_equipment_minutes_per_run,
      requirement.equipment_minutes_per_unit,
      requirement.minimum_instance_count
    from public.business_recipe_equipment_requirements as requirement
    where requirement.recipe_definition_id = v_job.recipe_definition_id
      and requirement.status = 'active'
    order by requirement.public_key
  loop
    v_expected := v_requirement.fixed_equipment_minutes_per_run
      + v_requirement.equipment_minutes_per_unit * v_job.quantity;
    select
      coalesce(sum(reservation.reserved_minutes), 0)::integer,
      count(distinct reservation.installation_id)::integer
    into v_actual, v_headcount
    from public.business_equipment_reservations as reservation
    where reservation.game_session_id = v_job.game_session_id
      and reservation.business_id = v_job.business_id
      and reservation.requirement_id = v_requirement.id
      and reservation.manufacturing_job_id = v_job.id
      and reservation.status in ('reserved','active');
    if v_actual <> v_expected
      or v_headcount < v_requirement.minimum_instance_count
    then
      raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_INCOMPLETE:%:%:%:%',
        v_requirement.id, v_expected, v_actual, v_headcount using errcode = 'P0001';
    end if;
  end loop;

  return new;
end
$function$;

create or replace function public.complete_business_manufacturing_job_v2(
  p_game_session_id uuid,
  p_job_id uuid,
  p_lease_token uuid
)
returns table (
  job_key text,
  status text,
  resource_state text,
  output_item_key text,
  output_quantity integer,
  material_cost_basis numeric,
  labor_cost_basis numeric,
  total_cost_basis numeric,
  finished_unit_cost numeric,
  cost_currency_code text,
  completed_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, extensions, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_job public.business_manufacturing_jobs%rowtype;
  v_business public.business_entities%rowtype;
  v_output public.game_items%rowtype;
  v_recipe_output public.physical_economy_recipe_outputs%rowtype;
  v_finished_goods_account_id uuid;
  v_finished_goods_holding public.inventory_holdings%rowtype;
  v_material public.business_manufacturing_job_materials%rowtype;
  v_wip_holding public.inventory_holdings%rowtype;
  v_receipt public.business_manufacturing_completion_receipts%rowtype;
  v_inventory_lines jsonb := '[]'::jsonb;
  v_inventory_post jsonb;
  v_inventory_transaction_id uuid;
  v_token_hash text;
  v_output_quantity integer;
  v_material_count integer := 0;
  v_labor_count integer := 0;
  v_equipment_count integer := 0;
  v_updated_count integer := 0;
  v_currency_count integer := 0;
  v_currency text;
  v_material_cost numeric(18,4) := 0;
  v_labor_cost numeric(18,4) := 0;
  v_total_cost numeric(18,4) := 0;
  v_unit_cost numeric(18,6) := 0;
begin
  if p_game_session_id is null
    or p_job_id is null
    or p_lease_token is null
  then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_REQUEST_INVALID'
      using errcode = 'P0001';
  end if;

  v_token_hash := encode(
    extensions.digest(p_lease_token::text, 'sha256'),
    'hex'
  );

  select job_row.*
  into v_job
  from public.business_manufacturing_jobs as job_row
  where job_row.game_session_id = p_game_session_id
    and job_row.id = p_job_id
  for update;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_JOB_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_job.status = 'completed' then
    if v_job.completion_token_hash is distinct from v_token_hash then
      raise exception 'BUSINESS_MANUFACTURING_COMPLETION_REPLAY_CONFLICT'
        using errcode = 'P0001';
    end if;

    select item_row.*
    into v_output
    from public.game_items as item_row
    where item_row.game_session_id = p_game_session_id
      and item_row.id = v_job.output_game_item_id;
    if not found then
      raise exception 'BUSINESS_MANUFACTURING_OUTPUT_INVALID'
        using errcode = 'P0001';
    end if;

    return query select
      v_job.public_key,
      v_job.status,
      v_job.resource_state,
      v_output.public_key,
      v_job.completed_output_quantity,
      v_job.material_cost_basis,
      v_job.labor_cost_basis,
      v_job.total_cost_basis,
      v_job.finished_unit_cost,
      v_job.cost_currency_code,
      v_job.completed_at,
      true;
    return;
  end if;

  if v_job.status <> 'in_progress'
    or v_job.resource_state <> 'reserved'
    or v_job.completes_at is null
    or v_job.completes_at > v_now
    or v_job.completion_lease_token is distinct from p_lease_token
    or v_job.completion_lease_expires_at is null
    or v_job.completion_lease_expires_at <= v_now
  then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID'
      using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_job.business_id
    and business_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_BUSINESS_INACTIVE'
      using errcode = 'P0001';
  end if;

  select item_row.*
  into v_output
  from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_job.output_game_item_id
    and item_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_OUTPUT_INVALID'
      using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.physical_economy_recipe_outputs as recipe_output
    where recipe_output.recipe_id = v_job.recipe_definition_id
  ) <> 1 then
    raise exception 'BUSINESS_MANUFACTURING_MULTI_OUTPUT_UNSUPPORTED'
      using errcode = 'P0001';
  end if;

  select recipe_output.*
  into v_recipe_output
  from public.physical_economy_recipe_outputs as recipe_output
  where recipe_output.recipe_id = v_job.recipe_definition_id
    and recipe_output.item_key = v_output.canonical_key
  limit 1;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_OUTPUT_INVALID'
      using errcode = 'P0001';
  end if;

  v_output_quantity := ceil(v_recipe_output.quantity * v_job.quantity)::integer;
  if v_output_quantity not between 1 and 100000000 then
    raise exception 'BUSINESS_MANUFACTURING_OUTPUT_QUANTITY_INVALID'
      using errcode = 'P0001';
  end if;

  v_finished_goods_account_id := economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_job.business_id,
    'finished_goods'
  );

  select holding_row.*
  into v_finished_goods_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_finished_goods_account_id
    and holding_row.game_item_id = v_output.id
  for update;

  select
    count(*)::integer,
    count(distinct material.cost_currency_code)::integer,
    min(material.cost_currency_code),
    round(
      coalesce(sum(material.staged_quantity * material.staged_unit_cost), 0),
      4
    )
  into
    v_material_count,
    v_currency_count,
    v_currency,
    v_material_cost
  from public.business_manufacturing_job_materials as material
  where material.game_session_id = p_game_session_id
    and material.job_id = v_job.id
    and material.status = 'staged';

  if v_material_count <= 0 then
    raise exception 'BUSINESS_MANUFACTURING_MATERIAL_HOLD_MISSING'
      using errcode = 'P0001';
  end if;
  if v_currency_count <> 1
    or v_currency is distinct from v_business.currency_code
  then
    raise exception 'BUSINESS_MANUFACTURING_COST_CURRENCY_MISMATCH'
      using errcode = 'P0001';
  end if;

  for v_material in
    select material.*
    from public.business_manufacturing_job_materials as material
    join public.game_items as item
      on item.game_session_id = material.game_session_id
     and item.id = material.game_item_id
    where material.game_session_id = p_game_session_id
      and material.job_id = v_job.id
      and material.status = 'staged'
    order by item.public_key, material.recipe_line_key
    for update of material
  loop
    select holding_row.*
    into v_wip_holding
    from public.inventory_holdings as holding_row
    where holding_row.game_session_id = p_game_session_id
      and holding_row.inventory_account_id = v_material.wip_account_id
      and holding_row.game_item_id = v_material.game_item_id
    for update;
    if not found
      or v_wip_holding.quantity_owned - v_wip_holding.quantity_reserved
        < v_material.staged_quantity
    then
      raise exception 'BUSINESS_MANUFACTURING_WIP_QUANTITY_UNAVAILABLE:%',
        v_material.public_key using errcode = 'P0001';
    end if;

    v_inventory_lines := v_inventory_lines || jsonb_build_array(
      jsonb_build_object(
        'inventoryAccountId', v_material.wip_account_id,
        'gameItemId', v_material.game_item_id,
        'playerId', null,
        'storeItemId', v_wip_holding.store_item_id,
        'quantityDelta', -v_material.staged_quantity,
        'reservationDelta', 0,
        'unitCost', v_material.staged_unit_cost,
        'currencyCode', v_material.cost_currency_code,
        'eventType', 'USED',
        'legacyEventQuantityDelta', -v_material.staged_quantity,
        'eventMetadata', jsonb_build_object(
          'businessKey', v_business.public_key,
          'jobKey', v_job.public_key,
          'materialKey', v_material.public_key,
          'location', 'work_in_progress'
        )
      )
    );
  end loop;

  select count(*)::integer,
    round(
      coalesce(sum(
        employee.wage_per_cycle
          * reservation.reserved_minutes::numeric
          / nullif(employee.labor_minutes_per_cycle, 0)::numeric
      ), 0),
      4
    )
  into v_labor_count, v_labor_cost
  from public.business_labor_reservations as reservation
  join public.business_employees as employee
    on employee.game_session_id = reservation.game_session_id
   and employee.id = reservation.employee_id
   and employee.business_id = reservation.business_id
  where reservation.game_session_id = p_game_session_id
    and reservation.business_id = v_job.business_id
    and reservation.manufacturing_job_id = v_job.id
    and reservation.status in ('reserved','active');

  if v_labor_count <= 0 then
    raise exception 'BUSINESS_MANUFACTURING_LABOR_HOLD_MISSING'
      using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.business_labor_reservations as reservation
    where reservation.game_session_id = p_game_session_id
      and reservation.business_id = v_job.business_id
      and reservation.manufacturing_job_id = v_job.id
      and reservation.status not in ('reserved','active')
  ) then
    raise exception 'BUSINESS_MANUFACTURING_LABOR_HOLD_CONFLICT'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_equipment_count
  from public.business_equipment_reservations as reservation
  where reservation.game_session_id = p_game_session_id
    and reservation.business_id = v_job.business_id
    and reservation.manufacturing_job_id = v_job.id
    and reservation.status in ('reserved','active');

  if exists (
    select 1
    from public.business_equipment_reservations as reservation
    where reservation.game_session_id = p_game_session_id
      and reservation.business_id = v_job.business_id
      and reservation.manufacturing_job_id = v_job.id
      and reservation.status not in ('reserved','active')
  ) then
    raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_CONFLICT'
      using errcode = 'P0001';
  end if;

  v_total_cost := round(v_material_cost + v_labor_cost, 4);
  v_unit_cost := round(v_total_cost / v_output_quantity::numeric, 6);

  v_inventory_lines := v_inventory_lines || jsonb_build_array(
    jsonb_build_object(
      'inventoryAccountId', v_finished_goods_account_id,
      'gameItemId', v_output.id,
      'playerId', null,
      'storeItemId', v_finished_goods_holding.store_item_id,
      'quantityDelta', v_output_quantity,
      'reservationDelta', 0,
      'unitCost', v_unit_cost,
      'currencyCode', v_currency,
      'eventType', 'ADJUSTED',
      'legacyEventQuantityDelta', v_output_quantity,
      'eventMetadata', jsonb_build_object(
        'businessKey', v_business.public_key,
        'jobKey', v_job.public_key,
        'recipeKey', v_job.recipe_snapshot ->> 'recipeKey',
        'location', 'finished_goods',
        'materialCostBasis', v_material_cost,
        'laborCostBasis', v_labor_cost,
        'totalCostBasis', v_total_cost
      )
    )
  );

  v_inventory_post := economy_private.post_inventory_transaction_v2(
    p_game_session_id,
    'production',
    'business_manufacturing',
    'job_completed',
    v_job.id,
    'mfg:complete:' || substr(
      encode(
        extensions.digest(
          concat_ws('|', p_game_session_id, v_job.id, v_output_quantity, v_total_cost),
          'sha256'
        ),
        'hex'
      ),
      1,
      48
    ),
    jsonb_build_object(
      'businessKey', v_business.public_key,
      'jobKey', v_job.public_key,
      'outputItemKey', v_output.public_key,
      'outputQuantity', v_output_quantity,
      'materialCostBasis', v_material_cost,
      'laborCostBasis', v_labor_cost,
      'totalCostBasis', v_total_cost,
      'finishedUnitCost', v_unit_cost
    ),
    v_inventory_lines
  );
  if coalesce(v_inventory_post ->> 'status', '') <> 'committed' then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_INVENTORY_POST_FAILED'
      using errcode = 'P0001';
  end if;

  begin
    v_inventory_transaction_id := (v_inventory_post ->> 'transactionId')::uuid;
  exception when invalid_text_representation then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_TRANSACTION_INVALID'
      using errcode = 'P0001';
  end;
  if v_inventory_transaction_id is null then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_TRANSACTION_MISSING'
      using errcode = 'P0001';
  end if;

  perform economy_private.refresh_manufacturing_inventory_projection_v1(p_game_session_id, v_job.business_id, v_finished_goods_account_id, v_output.id);
  for v_material in select material.* from public.business_manufacturing_job_materials material where material.game_session_id=p_game_session_id and material.job_id=v_job.id order by material.public_key loop
    perform economy_private.refresh_manufacturing_inventory_projection_v1(p_game_session_id, v_job.business_id, v_material.wip_account_id, v_material.game_item_id);
  end loop;

  update public.business_manufacturing_job_materials as completed_material
  set
    status = 'consumed',
    consumed_at = v_now
  where game_session_id = p_game_session_id
    and job_id = v_job.id
    and completed_material.status = 'staged';
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_material_count then
    raise exception 'BUSINESS_MANUFACTURING_MATERIAL_CONSUMPTION_CONFLICT'
      using errcode = 'P0001';
  end if;

  update public.business_labor_reservations as reservation
  set
    status = 'consumed',
    consumed_at = v_now,
    manufacturing_labor_cost_basis = round(
      employee.wage_per_cycle
        * reservation.reserved_minutes::numeric
        / nullif(employee.labor_minutes_per_cycle, 0)::numeric,
      4
    )
  from public.business_employees as employee
  where reservation.game_session_id = p_game_session_id
    and reservation.business_id = v_job.business_id
    and reservation.manufacturing_job_id = v_job.id
    and reservation.status in ('reserved','active')
    and employee.game_session_id = reservation.game_session_id
    and employee.id = reservation.employee_id
    and employee.business_id = reservation.business_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_labor_count then
    raise exception 'BUSINESS_MANUFACTURING_LABOR_CONSUMPTION_CONFLICT'
      using errcode = 'P0001';
  end if;

  update public.business_equipment_reservations as completed_equipment
  set
    status = 'consumed',
    consumed_at = v_now
  where game_session_id = p_game_session_id
    and business_id = v_job.business_id
    and manufacturing_job_id = v_job.id
    and completed_equipment.status in ('reserved','active');
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_equipment_count then
    raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_CONSUMPTION_CONFLICT'
      using errcode = 'P0001';
  end if;

  insert into public.business_manufacturing_completion_receipts(
    game_session_id,
    job_id,
    output_game_item_id,
    inventory_transaction_id,
    completion_token_hash,
    completed_output_quantity,
    material_cost_basis,
    labor_cost_basis,
    total_cost_basis,
    finished_unit_cost,
    cost_currency_code,
    completed_at
  ) values (
    p_game_session_id,
    v_job.id,
    v_output.id,
    v_inventory_transaction_id,
    v_token_hash,
    v_output_quantity,
    v_material_cost,
    v_labor_cost,
    v_total_cost,
    v_unit_cost,
    v_currency,
    v_now
  )
  returning * into v_receipt;

  update public.business_manufacturing_jobs as completed_job
  set
    status = 'completed',
    resource_state = 'consumed',
    completed_at = v_now,
    completion_lease_token = null,
    completion_lease_expires_at = null,
    last_error_code = null,
    last_error_detail = null,
    completed_output_quantity = v_output_quantity,
    material_cost_basis = v_material_cost,
    labor_cost_basis = v_labor_cost,
    total_cost_basis = v_total_cost,
    finished_unit_cost = v_unit_cost,
    cost_currency_code = v_currency,
    completion_token_hash = v_token_hash
  where game_session_id = p_game_session_id
    and id = v_job.id
    and completed_job.status = 'in_progress'
  returning * into v_job;
  if v_job.id is null then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_CONFLICT'
      using errcode = 'P0001';
  end if;

  insert into public.business_manufacturing_job_transitions(
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
    'completed',
    'system',
    null,
    'business.manufacturing.completed',
    'system:complete:' || v_job.public_key,
    jsonb_build_object(
      'jobKey', v_job.public_key,
      'receiptKey', v_receipt.public_key,
      'outputItemKey', v_output.public_key,
      'outputQuantity', v_output_quantity,
      'materialCostBasis', v_material_cost,
      'laborCostBasis', v_labor_cost,
      'totalCostBasis', v_total_cost,
      'finishedUnitCost', v_unit_cost,
      'inventoryTransactionId', v_inventory_transaction_id
    )
  )
  on conflict on constraint business_manufacturing_job_transitions_idempotency_unique
  do nothing;

  insert into public.audit_log(
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
    'business.manufacturing.completed',
    'business_manufacturing_job',
    v_job.id,
    jsonb_build_object(
      'jobKey', v_job.public_key,
      'receiptKey', v_receipt.public_key,
      'businessKey', v_business.public_key,
      'outputItemKey', v_output.public_key,
      'outputQuantity', v_output_quantity,
      'materialCostBasis', v_material_cost,
      'laborCostBasis', v_labor_cost,
      'totalCostBasis', v_total_cost,
      'finishedUnitCost', v_unit_cost,
      'payrollCashDebitCreated', false,
      'inventoryTransactionId', v_inventory_transaction_id
    )
  );

  return query select
    v_job.public_key,
    v_job.status,
    v_job.resource_state,
    v_output.public_key,
    v_output_quantity,
    v_material_cost,
    v_labor_cost,
    v_total_cost,
    v_unit_cost,
    v_currency,
    v_job.completed_at,
    false;
end
$function$;

commit;
