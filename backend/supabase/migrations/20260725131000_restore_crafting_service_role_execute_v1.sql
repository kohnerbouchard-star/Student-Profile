begin;

-- Crafting RPCs are invoked only by authenticated server routes or bounded
-- release tooling. Browser roles must not execute them directly. PostgreSQL
-- function EXECUTE privileges are independent from SECURITY DEFINER ownership,
-- so the service role needs explicit grants after the earlier public revocation.
revoke all on function public.read_player_crafting_v1(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.start_player_crafting_job_v1(uuid,uuid,text,integer,jsonb,text)
  from public, anon, authenticated;
revoke all on function public.cancel_player_crafting_job_v1(uuid,uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.claim_player_crafting_job_v1(uuid,uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.set_player_equipment_slot_v1(uuid,uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.use_player_inventory_item_effect_v1(uuid,uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.salvage_player_equipment_v1(uuid,uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.read_admin_crafting_oversight_v1(uuid,uuid,text,integer)
  from public, anon, authenticated;
revoke all on function public.recover_admin_crafting_job_v1(uuid,uuid,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.apply_admin_physical_economy_supply_v1(uuid,uuid,text,text,text,integer,numeric,numeric,text,timestamptz,text)
  from public, anon, authenticated;
revoke all on function public.import_physical_economy_pack_v1(uuid,uuid,jsonb,text,text)
  from public, anon, authenticated;
revoke all on function public.activate_physical_economy_pack_v1(uuid,uuid,text,text,text)
  from public, anon, authenticated;

grant execute on function public.read_player_crafting_v1(uuid,uuid)
  to service_role;
grant execute on function public.start_player_crafting_job_v1(uuid,uuid,text,integer,jsonb,text)
  to service_role;
grant execute on function public.cancel_player_crafting_job_v1(uuid,uuid,text,text)
  to service_role;
grant execute on function public.claim_player_crafting_job_v1(uuid,uuid,text,text)
  to service_role;
grant execute on function public.set_player_equipment_slot_v1(uuid,uuid,text,text,text)
  to service_role;
grant execute on function public.use_player_inventory_item_effect_v1(uuid,uuid,text,text,text)
  to service_role;
grant execute on function public.salvage_player_equipment_v1(uuid,uuid,text,text)
  to service_role;
grant execute on function public.read_admin_crafting_oversight_v1(uuid,uuid,text,integer)
  to service_role;
grant execute on function public.recover_admin_crafting_job_v1(uuid,uuid,text,text,text,text)
  to service_role;
grant execute on function public.apply_admin_physical_economy_supply_v1(uuid,uuid,text,text,text,integer,numeric,numeric,text,timestamptz,text)
  to service_role;
grant execute on function public.import_physical_economy_pack_v1(uuid,uuid,jsonb,text,text)
  to service_role;
grant execute on function public.activate_physical_economy_pack_v1(uuid,uuid,text,text,text)
  to service_role;

do $$
begin
  if not has_function_privilege('service_role', 'public.read_player_crafting_v1(uuid,uuid)', 'execute') then
    raise exception 'service_role privilege contract failed for read_player_crafting_v1';
  end if;
  if not has_function_privilege('service_role', 'public.start_player_crafting_job_v1(uuid,uuid,text,integer,jsonb,text)', 'execute') then
    raise exception 'service_role privilege contract failed for start_player_crafting_job_v1';
  end if;
  if not has_function_privilege('service_role', 'public.read_admin_crafting_oversight_v1(uuid,uuid,text,integer)', 'execute') then
    raise exception 'service_role privilege contract failed for read_admin_crafting_oversight_v1';
  end if;
  if has_function_privilege('anon', 'public.read_player_crafting_v1(uuid,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.read_player_crafting_v1(uuid,uuid)', 'execute') then
    raise exception 'browser role unexpectedly retained crafting execute privilege';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
