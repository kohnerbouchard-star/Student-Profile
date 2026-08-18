begin;

create or replace function public.campaign_program_digest_v1(
  p_program jsonb
)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public, extensions
as $function$
  select 'sha256:' || encode(
    extensions.digest((p_program - 'definitionDigest')::text, 'sha256'),
    'hex'
  );
$function$;

revoke all on function public.campaign_program_digest_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.campaign_program_digest_v1(jsonb)
  to service_role;

with canonical as (
  select
    pack_id,
    pack_version,
    definition_id,
    definition_digest as old_digest,
    public.campaign_program_digest_v1(program) as new_digest
  from public.campaign_program_definitions
  where pack_id = 'econovaria.beta-seed-pack.v1'
    and pack_version = '1.0.0-beta'
    and definition_id = 'campaign.beta.primary.v1'
)
update public.campaign_program_definitions as program_row
set
  definition_digest = canonical.new_digest,
  program = jsonb_set(
    program_row.program,
    '{definitionDigest}',
    to_jsonb(canonical.new_digest),
    true
  )
from canonical
where program_row.pack_id = canonical.pack_id
  and program_row.pack_version = canonical.pack_version
  and program_row.definition_id = canonical.definition_id;

with canonical as (
  select pack_id, pack_version, definition_id, definition_digest
  from public.campaign_program_definitions
  where pack_id = 'econovaria.beta-seed-pack.v1'
    and pack_version = '1.0.0-beta'
    and definition_id = 'campaign.beta.primary.v1'
)
update public.campaign_instances as campaign_row
set definition_digest = canonical.definition_digest,
    updated_at = clock_timestamp()
from canonical
where campaign_row.pack_id = canonical.pack_id
  and campaign_row.pack_version = canonical.pack_version
  and campaign_row.definition_id = canonical.definition_id
  and campaign_row.definition_digest <> canonical.definition_digest;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'campaign_program_definitions_digest_matches_program'
      and conrelid = 'public.campaign_program_definitions'::regclass
  ) then
    alter table public.campaign_program_definitions
      add constraint campaign_program_definitions_digest_matches_program
      check (
        definition_digest = public.campaign_program_digest_v1(program)
        and program->>'definitionDigest' = definition_digest
      );
  end if;
end;
$constraint$;

comment on function public.campaign_program_digest_v1(jsonb) is
  'Computes the immutable SHA-256 identity for a campaign program over canonical jsonb text excluding the self-referential definitionDigest field.';

commit;
