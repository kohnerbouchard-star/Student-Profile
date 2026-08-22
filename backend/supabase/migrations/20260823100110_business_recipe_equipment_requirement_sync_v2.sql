-- Keep Business equipment requirements synchronized with canonical recipe
-- required_tools after future content-pack imports or recipe activation changes.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function economy_private.sync_business_recipe_equipment_requirements_trigger_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  if new.status = 'active' then
    perform public.sync_business_recipe_equipment_requirements_v2(new.id);
  else
    update public.business_recipe_equipment_requirements as requirement
    set
      status = 'disabled',
      version = requirement.version + 1,
      updated_at = statement_timestamp()
    where requirement.recipe_definition_id = new.id
      and requirement.source_kind = 'canonical_required_tool_v1'
      and requirement.status = 'active';
  end if;
  return new;
end
$function$;

drop trigger if exists sync_business_recipe_equipment_requirements_v2
  on public.physical_economy_recipe_definitions;
create trigger sync_business_recipe_equipment_requirements_v2
after insert or update of required_tools, base_duration_seconds, status
on public.physical_economy_recipe_definitions
for each row execute function economy_private.sync_business_recipe_equipment_requirements_trigger_v2();

revoke all on function economy_private.sync_business_recipe_equipment_requirements_trigger_v2()
  from public, anon, authenticated;
grant execute on function economy_private.sync_business_recipe_equipment_requirements_trigger_v2()
  to service_role;

commit;
