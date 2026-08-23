-- Phase 6B migration-time assertions. These statements deliberately resolve
-- every retained canonical column/function used by the manufacturing start
-- transaction so a database replay fails before runtime if authority drifts.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $assertions$
begin
  perform
    reservation.game_session_id,
    reservation.business_id,
    reservation.employee_id,
    reservation.role_definition_id,
    reservation.production_run_id,
    reservation.manufacturing_job_id,
    reservation.period_key,
    reservation.reservation_kind,
    reservation.source_reference_key,
    reservation.reserved_minutes,
    reservation.status,
    reservation.idempotency_key,
    reservation.request_hash
  from public.business_labor_reservations as reservation
  limit 0;

  perform
    reservation.game_session_id,
    reservation.business_id,
    reservation.installation_id,
    reservation.requirement_id,
    reservation.production_run_id,
    reservation.manufacturing_job_id,
    reservation.period_key,
    reservation.intent_ref,
    reservation.reserved_minutes,
    reservation.status,
    reservation.idempotency_key,
    reservation.request_hash
  from public.business_equipment_reservations as reservation
  limit 0;

  perform
    material.game_session_id,
    material.job_id,
    material.recipe_line_key,
    material.game_item_id,
    material.warehouse_account_id,
    material.wip_account_id,
    material.staged_quantity,
    material.staged_unit_cost,
    material.cost_currency_code,
    material.inventory_transaction_id,
    material.status,
    material.consumed_at,
    material.released_at
  from public.business_manufacturing_job_materials as material
  limit 0;

  perform
    account.game_session_id,
    account.party_id,
    account.account_kind,
    account.location_key,
    account.status
  from public.inventory_accounts as account
  limit 0;

  perform
    holding.game_session_id,
    holding.inventory_account_id,
    holding.game_item_id,
    holding.quantity_owned,
    holding.quantity_reserved,
    holding.average_unit_cost,
    holding.cost_currency_code,
    holding.store_item_id
  from public.inventory_holdings as holding
  limit 0;

  perform
    input.recipe_id,
    input.line_key,
    input.item_key,
    input.base_quantity
  from public.physical_economy_recipe_inputs as input
  limit 0;

  if to_regprocedure(
    'economy_private.post_inventory_transaction_v2(uuid,text,text,text,uuid,text,jsonb,jsonb)'
  ) is null then
    raise exception 'BUSINESS_MANUFACTURING_INVENTORY_POSTER_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if to_regprocedure(
    'public.reserve_business_equipment_v2(uuid,text,text,text,text,integer,text,text)'
  ) is null then
    raise exception 'BUSINESS_MANUFACTURING_EQUIPMENT_RESERVATION_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if to_regprocedure(
    'public.current_business_payroll_period_key_v2(uuid,uuid)'
  ) is null
    or to_regprocedure(
      'public.current_business_equipment_period_key_v2(uuid,uuid)'
    ) is null
  then
    raise exception 'BUSINESS_MANUFACTURING_PERIOD_AUTHORITY_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if to_regprocedure(
    'public.start_business_manufacturing_job_v2(uuid,uuid,text,text,integer,text,text)'
  ) is null then
    raise exception 'BUSINESS_MANUFACTURING_START_COMMAND_UNAVAILABLE'
      using errcode = 'P0001';
  end if;
end
$assertions$;

commit;