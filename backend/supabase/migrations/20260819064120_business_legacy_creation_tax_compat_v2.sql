-- Preserve legacy Business creation after the Business V2 authority columns became mandatory.
--
-- `create_or_acquire_player_business_v1` remains an intentionally supported compatibility
-- command while the V2 formation flow is introduced. That command predates
-- `business_entities.tax_classification` and therefore omits the column on insert.
-- Phase 1 made the column NOT NULL, which caused the connected Player Business lifecycle
-- to fail before a Business could be created.
--
-- Keep tax classification server-owned at the table boundary. Explicit V2 classifications
-- are never overwritten; only omitted classifications from supported legacy entity types
-- are derived here.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.fill_legacy_business_tax_classification_v2()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if new.tax_classification is not null and btrim(new.tax_classification) <> '' then
    return new;
  end if;

  new.tax_classification := case lower(btrim(coalesce(new.entity_type, '')))
    when 'sole_proprietorship' then 'disregarded'
    when 'partnership' then 'partnership'
    when 'corporation' then 'c_corporation'
    when 'cooperative' then 'cooperative_legacy'
    else new.tax_classification
  end;

  return new;
end
$function$;

comment on function public.fill_legacy_business_tax_classification_v2() is
  'Compatibility write-boundary guard for legacy Business creation. Derives tax classification only when an old supported entity type omits it; V2 callers must continue supplying their authoritative classification.';

drop trigger if exists fill_legacy_business_tax_classification_v2
  on public.business_entities;

create trigger fill_legacy_business_tax_classification_v2
before insert on public.business_entities
for each row
when (new.tax_classification is null)
execute function public.fill_legacy_business_tax_classification_v2();

-- The trigger is internal database authority. Browser/API roles never invoke it directly.
revoke all on function public.fill_legacy_business_tax_classification_v2() from public, anon, authenticated;
grant execute on function public.fill_legacy_business_tax_classification_v2() to service_role;

commit;
