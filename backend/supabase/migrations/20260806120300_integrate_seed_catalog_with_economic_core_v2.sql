-- Seed release integration with the canonical economic item catalog V2.
-- Keeps the public importer RPC signature unchanged and synchronizes only after
-- the historical release transaction reports success.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $rename$
begin
  if to_regprocedure(
    'public.apply_seed_content_release_legacy_v1(uuid,text,text,text,text,boolean,text,text,jsonb,jsonb,jsonb,integer)'
  ) is null then
    if to_regprocedure(
      'public.apply_seed_content_release_v1(uuid,text,text,text,text,boolean,text,text,jsonb,jsonb,jsonb,integer)'
    ) is null then
      raise exception 'ECONOMIC_CORE_SEED_RELEASE_DEPENDENCY_MISSING' using errcode = 'P0001';
    end if;

    alter function public.apply_seed_content_release_v1(
      uuid, text, text, text, text, boolean, text, text,
      jsonb, jsonb, jsonb, integer
    ) rename to apply_seed_content_release_legacy_v1;
  end if;
end
$rename$;

create or replace function public.apply_seed_content_release_v1(
  p_game_session_id uuid,
  p_pack_id text,
  p_version text,
  p_pack_sha256 text,
  p_target_environment text,
  p_activate boolean,
  p_authorization_id text,
  p_approved_by text,
  p_market_templates jsonb,
  p_contract_templates jsonb,
  p_store_items jsonb,
  p_fail_after_operations integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_release jsonb;
  v_catalog jsonb;
begin
  v_release := public.apply_seed_content_release_legacy_v1(
    p_game_session_id,
    p_pack_id,
    p_version,
    p_pack_sha256,
    p_target_environment,
    p_activate,
    p_authorization_id,
    p_approved_by,
    p_market_templates,
    p_contract_templates,
    p_store_items,
    p_fail_after_operations
  );

  if coalesce(v_release ->> 'outcome', '') = 'failed' then
    return v_release;
  end if;

  v_catalog := public.sync_game_item_catalog_v2(
    p_game_session_id,
    p_store_items
  );

  return v_release || jsonb_build_object(
    'economicAssetCore', v_catalog,
    'canonicalItemIdentitySynchronized', true
  );
end
$function$;

revoke all on function public.apply_seed_content_release_v1(
  uuid, text, text, text, text, boolean, text, text,
  jsonb, jsonb, jsonb, integer
) from public, anon, authenticated;
grant execute on function public.apply_seed_content_release_v1(
  uuid, text, text, text, text, boolean, text, text,
  jsonb, jsonb, jsonb, integer
) to service_role;

comment on function public.apply_seed_content_release_v1(
  uuid, text, text, text, text, boolean, text, text,
  jsonb, jsonb, jsonb, integer
) is
  'Preserves the transactional Seed release contract and synchronizes explicit Store sourceItemStableId mappings into canonical game items after successful release execution.';

commit;
