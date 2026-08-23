-- Phase 6C migration-time assertions. Database Replay must prove that the
-- completion transaction references retained canonical Inventory, labor,
-- equipment, output, and lease authority exactly as implemented.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $assertions$
begin
  perform
    job.game_session_id,
    job.business_id,
    job.recipe_definition_id,
    job.output_game_item_id,
    job.status,
    job.resource_state,
    job.completes_at,
    job.completion_lease_token,
    job.completion_lease_expires_at,
    job.completed_output_quantity,
    job.material_cost_basis,
    job.labor_cost_basis,
    job.total_cost_basis,
    job.finished_unit_cost,
    job.completion_token_hash
  from public.business_manufacturing_jobs as job
  limit 0;

  perform
    material.game_session_id,
    material.job_id,
    material.game_item_id,
    material.wip_account_id,
    material.staged_quantity,
    material.staged_unit_cost,
    material.cost_currency_code,
    material.status,
    material.consumed_at,
    material.released_at
  from public.business_manufacturing_job_materials as material
  limit 0;

  perform
    reservation.game_session_id,
    reservation.business_id,
    reservation.employee_id,
    reservation.manufacturing_job_id,
    reservation.reserved_minutes,
    reservation.status,
    reservation.consumed_at,
    reservation.released_at,
    reservation.manufacturing_labor_cost_basis
  from public.business_labor_reservations as reservation
  limit 0;

  perform
    reservation.game_session_id,
    reservation.business_id,
    reservation.installation_id,
    reservation.manufacturing_job_id,
    reservation.reserved_minutes,
    reservation.status,
    reservation.consumed_at,
    reservation.released_at
  from public.business_equipment_reservations as reservation
  limit 0;

  perform
    output.recipe_id,
    output.item_key,
    output.base_quantity
  from public.physical_economy_recipe_outputs as output
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

  if to_regprocedure(
    'economy_private.post_inventory_transaction_v2(uuid,text,text,text,uuid,text,jsonb,jsonb)'
  ) is null then
    raise exception 'BUSINESS_MANUFACTURING_INVENTORY_POSTER_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if to_regprocedure(
    'public.claim_due_business_manufacturing_jobs_v2(uuid,integer,integer)'
  ) is null
    or to_regprocedure(
      'public.complete_business_manufacturing_job_v2(uuid,uuid,uuid)'
    ) is null
  then
    raise exception 'BUSINESS_MANUFACTURING_COMPLETION_AUTHORITY_UNAVAILABLE'
      using errcode = 'P0001';
  end if;
end
$assertions$;

commit;
