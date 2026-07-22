-- Fail-closed identity wrapper for the PR #163 Crafting pack importer.
-- Final controller-assigned Crafting migration identity.

alter function public.import_physical_economy_pack_v1(uuid, uuid, jsonb, text, text)
  rename to import_physical_economy_pack_unchecked_v1;

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
  v_seed_pack_digest constant text := '190d09e5d0be729388af1d8e304d27e630bef40fba1f055c4272377f39b3f5e8';
  v_merged_seed_sha constant text := '6ced5aa36e60dfbd82620463f4f4bf6f56a349dd';
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
    or coalesce(p_pack->>'definitionAuthority','') <> 'PR #163'
  then
    raise exception 'PHYSICAL_ECONOMY_PACK_IDENTITY_MISMATCH'
      using errcode='P0001',
      hint='Import requires the exact merged PR #163 identity and matching runtime and Seed digests.';
  end if;

  select * into v_event
  from public.physical_economy_admin_events
  where game_session_id=p_game_session_id
    and staff_user_id=p_staff_user_id
    and action='pack.import'
    and idempotency_key=p_idempotency_key
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

revoke all on function public.import_physical_economy_pack_unchecked_v1(uuid,uuid,jsonb,text,text)
  from public, anon, authenticated;
revoke all on function public.import_physical_economy_pack_v1(uuid,uuid,jsonb,text,text)
  from public, anon, authenticated;
