begin;

-- Forward-only identity binding for the exact accepted Seed physical-economy
-- definitions with the reviewed V3 non-production activation authority.
-- Definition bytes, source SHA, Seed digest, and production denial remain fixed.

create or replace function public.import_physical_economy_pack_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_pack jsonb,
  p_content_digest text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_pack_key constant text := 'econovaria.beta-seed-pack.v1';
  v_pack_version constant text := '1.0.0-beta';
  v_seed_pack_digest constant text := '31f2f8e60c61b18eeab5cdac6e2930ae2f92a695b74e889a24129304e76547b7';
  v_merged_seed_sha constant text := '04824da5ed8ea47bbabd893ab27f7ac285f050f2';
  v_definition_authority constant text := 'PR #163 with bounded V3 staging activation authority';
  v_runtime_digest text := lower(btrim(coalesce(p_pack->>'contentDigest','')));
  v_event public.physical_economy_admin_events%rowtype;
begin
  if p_pack is null
    or p_pack->>'schemaVersion' <> 'econovaria-physical-economy-runtime-pack-v1'
    or lower(btrim(coalesce(p_pack->>'packKey',''))) <> v_pack_key
    or btrim(coalesce(p_pack->>'contentVersion','')) <> v_pack_version
    or lower(btrim(coalesce(p_pack->>'sourceCommit',''))) <> v_merged_seed_sha
    or v_runtime_digest !~ '^[a-f0-9]{64}$'
    or lower(btrim(coalesce(p_content_digest,''))) !~ '^[a-f0-9]{64}$'
    or v_runtime_digest <> lower(btrim(coalesce(p_content_digest,'')))
    or lower(btrim(coalesce(p_pack #>> '{sourceContracts,packDigest}',''))) <> v_seed_pack_digest
    or coalesce((p_pack #>> '{activationAuthorization,productionAuthorized}')::boolean,true) is not false
    or coalesce(p_pack->>'definitionAuthority','') <> v_definition_authority
    or coalesce(p_pack #>> '{activationAuthorization,authorizationId}','') <> 'crafting.activation.v3.20260724'
    or coalesce((p_pack #>> '{activationAuthorization,catalogAuthorized}')::boolean,false) is not true
    or coalesce((p_pack #>> '{activationAuthorization,recipeAuthorized}')::boolean,false) is not true
    or coalesce((p_pack #>> '{activationAuthorization,calibrationAuthorized}')::boolean,false) is not true
    or coalesce((p_pack #>> '{activationAuthorization,downstreamContractValidated}')::boolean,false) is not true
    or not (coalesce(p_pack #> '{activationAuthorization,approvedEnvironments}','[]'::jsonb)
      @> '["local","test","staging"]'::jsonb)
  then
    raise exception 'PHYSICAL_ECONOMY_PACK_IDENTITY_MISMATCH'
      using errcode='P0001',
      hint='Import requires the exact accepted Seed definitions, V3 activation authority, matching runtime and Seed digests, and production denial.';
  end if;

  select event_row.* into v_event
  from public.physical_economy_admin_events as event_row
  where event_row.game_session_id=p_game_session_id
    and event_row.staff_user_id=p_staff_user_id
    and event_row.action='pack.import'
    and event_row.idempotency_key=p_idempotency_key
  for update;

  if found and (
    v_event.target_key is distinct from v_pack_key
    or coalesce(v_event.outcome->>'contentVersion','') is distinct from v_pack_version
    or lower(coalesce(v_event.outcome->>'contentDigest','')) is distinct from v_runtime_digest
    or lower(coalesce(v_event.outcome->>'sourceCommit','')) is distinct from v_merged_seed_sha
  ) then
    raise exception 'PHYSICAL_ECONOMY_IMPORT_IDEMPOTENCY_CONFLICT'
      using errcode='P0001';
  end if;

  return public.import_physical_economy_pack_unchecked_v1(
    p_game_session_id,
    p_staff_user_id,
    p_pack,
    p_content_digest,
    p_idempotency_key
  );
end
$function$;

comment on function public.import_physical_economy_pack_v1(
  uuid, uuid, jsonb, text, text
) is
  'Imports the exact accepted Seed physical-economy definitions only when bound to the reviewed V3 local/test/staging activation authority. Production authorization remains false.';

revoke all on function public.import_physical_economy_pack_v1(
  uuid, uuid, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.import_physical_economy_pack_v1(
  uuid, uuid, jsonb, text, text
) to service_role;

commit;
