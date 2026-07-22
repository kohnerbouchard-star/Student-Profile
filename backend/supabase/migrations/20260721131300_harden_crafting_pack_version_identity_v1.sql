-- Fail closed when one pack key/version maps to multiple runtime digests.
-- Final controller-assigned Crafting migration identity.

do $block$
begin
  if exists (
    select 1
    from public.physical_economy_content_packs
    group by pack_key, content_version
    having count(*) > 1
  ) then
    raise exception 'PHYSICAL_ECONOMY_PACK_VERSION_AMBIGUOUS'
      using errcode='P0001';
  end if;
end;
$block$;

create unique index if not exists physical_economy_pack_version_identity_idx
  on public.physical_economy_content_packs(pack_key, content_version);

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.physical_economy_salvage_rules'::regclass
      and conname='physical_economy_salvage_outputs_nonempty'
  ) then
    alter table public.physical_economy_salvage_rules
      add constraint physical_economy_salvage_outputs_nonempty
      check (jsonb_array_length(outputs) > 0);
  end if;
end;
$block$;
