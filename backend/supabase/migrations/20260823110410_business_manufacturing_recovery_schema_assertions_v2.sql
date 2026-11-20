-- Phase 6D recovery hardening and migration-time assertions.
--
-- A terminal release must remain possible after an operational Business/account
-- becomes inactive; immutable staged evidence is sufficient to reverse WIP to
-- its recorded Warehouse. Inserts and successful consumption still require the
-- active canonical ownership chain.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function economy_private.guard_business_manufacturing_material_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
declare
  v_job public.business_manufacturing_jobs%rowtype;
  v_business_party public.economic_parties%rowtype;
  v_warehouse public.inventory_accounts%rowtype;
  v_wip public.inventory_accounts%rowtype;
  v_item public.game_items%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.game_session_id is distinct from old.game_session_id
      or new.job_id is distinct from old.job_id
      or new.recipe_line_key is distinct from old.recipe_line_key
      or new.game_item_id is distinct from old.game_item_id
      or new.warehouse_account_id is distinct from old.warehouse_account_id
      or new.wip_account_id is distinct from old.wip_account_id
      or new.staged_quantity is distinct from old.staged_quantity
      or new.staged_unit_cost is distinct from old.staged_unit_cost
      or new.cost_currency_code is distinct from old.cost_currency_code
      or new.created_at is distinct from old.created_at
    then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_IDENTITY_IMMUTABLE'
        using errcode = '42501';
    end if;

    if old.status in ('consumed','released') and new.status <> old.status then
      raise exception 'BUSINESS_MANUFACTURING_MATERIAL_TERMINAL'
        using errcode = 'P0001';
    end if;

    if old.status = 'staged' and new.status = 'released' then
      return new;
    end if;
  end if;

  select job_row.*
  into v_job
  from public.business_manufacturing_jobs as job_row
  where job_row.game_session_id = new.game_session_id
    and job_row.id = new.job_id;
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_JOB_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select party_row.*
  into v_business_party
  from public.economic_parties as party_row
  where party_row.game_session_id = new.game_session_id
    and party_row.party_kind = 'business'
    and party_row.business_id = v_job.business_id
    and party_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_MANUFACTURING_PARTY_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_warehouse
  from public.inventory_accounts as account_row
  where account_row.game_session_id = new.game_session_id
    and account_row.id = new.warehouse_account_id
    and account_row.party_id = v_business_party.id
    and account_row.status = 'active';
  if not found
    or not (
      v_warehouse.account_kind = 'warehouse'
      or lower(coalesce(v_warehouse.location_key, '')) in ('warehouse','materials')
    )
  then
    raise exception 'BUSINESS_MANUFACTURING_WAREHOUSE_INVALID'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_wip
  from public.inventory_accounts as account_row
  where account_row.game_session_id = new.game_session_id
    and account_row.id = new.wip_account_id
    and account_row.party_id = v_business_party.id
    and account_row.status = 'active';
  if not found
    or not (
      v_wip.account_kind = 'work_in_progress'
      or lower(coalesce(v_wip.location_key, '')) in ('work_in_progress','wip')
    )
  then
    raise exception 'BUSINESS_MANUFACTURING_WIP_INVALID'
      using errcode = 'P0001';
  end if;

  select item_row.*
  into v_item
  from public.game_items as item_row
  where item_row.game_session_id = new.game_session_id
    and item_row.id = new.game_item_id
    and item_row.status = 'active';
  if not found
    or not exists (
      select 1
      from public.physical_economy_recipe_inputs as recipe_input
      where recipe_input.recipe_id = v_job.recipe_definition_id
        and recipe_input.line_key = new.recipe_line_key
        and recipe_input.item_key = v_item.canonical_key
    )
  then
    raise exception 'BUSINESS_MANUFACTURING_MATERIAL_LINE_INVALID'
      using errcode = 'P0001';
  end if;

  return new;
end
$function$;

do $assertions$
begin
  perform
    job.game_session_id,
    job.business_id,
    job.status,
    job.resource_state,
    job.completion_attempt_count,
    job.completion_max_attempts,
    job.completion_lease_token,
    job.completion_lease_expires_at,
    job.terminal_idempotency_key,
    job.terminal_request_hash,
    job.terminal_reason_code,
    job.terminal_actor_type,
    job.cancelled_at,
    job.failed_at
  from public.business_manufacturing_jobs as job
  limit 0;

  perform
    material.game_session_id,
    material.job_id,
    material.warehouse_account_id,
    material.wip_account_id,
    material.game_item_id,
    material.staged_quantity,
    material.staged_unit_cost,
    material.cost_currency_code,
    material.status,
    material.released_at
  from public.business_manufacturing_job_materials as material
  limit 0;

  perform
    reservation.manufacturing_job_id,
    reservation.status,
    reservation.released_at
  from public.business_labor_reservations as reservation
  limit 0;

  perform
    reservation.manufacturing_job_id,
    reservation.status,
    reservation.released_at
  from public.business_equipment_reservations as reservation
  limit 0;

  if to_regprocedure(
    'economy_private.post_inventory_transaction_v2(uuid,text,text,text,uuid,text,jsonb,jsonb)'
  ) is null
    or to_regprocedure(
      'economy_private.release_business_manufacturing_resources_v2(uuid,uuid,text,text)'
    ) is null
  then
    raise exception 'BUSINESS_MANUFACTURING_RECOVERY_AUTHORITY_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if to_regprocedure(
    'public.cancel_business_manufacturing_job_v2(uuid,uuid,text,text,text)'
  ) is null
    or to_regprocedure(
      'public.fail_business_manufacturing_job_v2(uuid,uuid,text,text)'
    ) is null
    or to_regprocedure(
      'public.fail_exhausted_business_manufacturing_jobs_v2(uuid,integer)'
    ) is null
  then
    raise exception 'BUSINESS_MANUFACTURING_TERMINAL_COMMAND_UNAVAILABLE'
      using errcode = 'P0001';
  end if;
end
$assertions$;

commit;
