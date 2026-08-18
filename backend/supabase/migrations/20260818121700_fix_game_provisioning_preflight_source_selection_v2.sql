begin;

create or replace function public.game_provisioning_preflight_v1(
  p_pack_id text default 'econovaria.beta-seed-pack.v1'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_release public.seed_content_releases%rowtype;
  v_stock_templates integer;
  v_game_stock_assets integer;
  v_contract_templates integer;
  v_game_contracts integer;
  v_store_items integer;
  v_world_locations integer;
  v_world_routes integer;
  v_world_countries integer;
  v_arrival_class_grants integer;
begin
  if not public.seed_content_request_is_privileged_v1() then
    raise exception 'GAME_PROVISIONING_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_pack_id is null or length(btrim(p_pack_id)) not between 1 and 128 then
    raise exception 'GAME_PROVISIONING_PACK_INVALID' using errcode = 'P0001';
  end if;

  select release_row.* into v_release
  from public.seed_content_releases as release_row
  where release_row.pack_id = btrim(p_pack_id)
    and release_row.status = 'applied_active'
    and release_row.target_environment in ('local', 'test', 'staging')
    and (
      select count(*)
      from public.seed_content_release_members as member_row
      where member_row.release_id = release_row.id
        and member_row.object_type = 'stock_template'
    ) = 240
    and (
      select count(*)
      from public.seed_content_release_members as member_row
      where member_row.release_id = release_row.id
        and member_row.object_type = 'game_stock_asset'
    ) = 240
    and (
      select count(*)
      from public.seed_content_release_members as member_row
      where member_row.release_id = release_row.id
        and member_row.object_type = 'contract_template'
    ) = 30
    and (
      select count(*)
      from public.seed_content_release_members as member_row
      where member_row.release_id = release_row.id
        and member_row.object_type = 'game_contract'
    ) = 30
    and (
      select count(*)
      from public.seed_content_release_members as member_row
      where member_row.release_id = release_row.id
        and member_row.object_type = 'store_item'
    ) = 50
    and exists (
      select 1
      from public.world_runtime_instances as runtime_row
      where runtime_row.game_session_id = release_row.game_session_id
        and runtime_row.revision = 0
    )
    and (
      select count(*) from public.world_location_states
      where game_session_id = release_row.game_session_id
    ) = 50
    and (
      select count(*) from public.world_route_states
      where game_session_id = release_row.game_session_id
    ) = 13
    and (
      select count(*) from public.world_country_runtime
      where game_session_id = release_row.game_session_id
    ) = 10
    and (
      select count(*) from public.arrival_class_grant_runtime
      where game_session_id = release_row.game_session_id
    ) = 8
  order by release_row.applied_at desc nulls last, release_row.created_at desc
  limit 1;

  if not found then
    raise exception 'GAME_PROVISIONING_CANONICAL_SOURCE_INCOMPLETE' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_stock_templates
  from public.seed_content_release_members
  where release_id = v_release.id and object_type = 'stock_template';

  select count(*)::integer into v_game_stock_assets
  from public.seed_content_release_members
  where release_id = v_release.id and object_type = 'game_stock_asset';

  select count(*)::integer into v_contract_templates
  from public.seed_content_release_members
  where release_id = v_release.id and object_type = 'contract_template';

  select count(*)::integer into v_game_contracts
  from public.seed_content_release_members
  where release_id = v_release.id and object_type = 'game_contract';

  select count(*)::integer into v_store_items
  from public.seed_content_release_members
  where release_id = v_release.id and object_type = 'store_item';

  select count(*)::integer into v_world_locations
  from public.world_location_states
  where game_session_id = v_release.game_session_id;

  select count(*)::integer into v_world_routes
  from public.world_route_states
  where game_session_id = v_release.game_session_id;

  select count(*)::integer into v_world_countries
  from public.world_country_runtime
  where game_session_id = v_release.game_session_id;

  select count(*)::integer into v_arrival_class_grants
  from public.arrival_class_grant_runtime
  where game_session_id = v_release.game_session_id;

  return jsonb_build_object(
    'ready', true,
    'packId', v_release.pack_id,
    'packVersion', v_release.version,
    'packSha256', v_release.pack_sha256,
    'sourceGameSessionId', v_release.game_session_id,
    'counts', jsonb_build_object(
      'stockTemplates', v_stock_templates,
      'gameStockAssets', v_game_stock_assets,
      'contractTemplates', v_contract_templates,
      'gameContracts', v_game_contracts,
      'storeItems', v_store_items,
      'worldLocations', v_world_locations,
      'worldRoutes', v_world_routes,
      'worldCountries', v_world_countries,
      'arrivalClassGrants', v_arrival_class_grants
    )
  );
end;
$function$;

revoke all on function public.game_provisioning_preflight_v1(text)
  from public, anon, authenticated;
grant execute on function public.game_provisioning_preflight_v1(text)
  to service_role;

comment on function public.game_provisioning_preflight_v1(text) is
  'Selects the newest release that already satisfies every canonical source invariant. Normal game releases that have advanced World revisions cannot shadow the protected revision-zero source.';

commit;
