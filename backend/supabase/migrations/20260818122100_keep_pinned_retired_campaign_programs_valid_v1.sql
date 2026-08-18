begin;

create or replace function public.verify_provisioned_game_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_game public.game_sessions%rowtype;
  v_market_assets integer;
  v_contracts integer;
  v_store_items integer;
  v_world_locations integer;
  v_world_routes integer;
  v_world_countries integer;
  v_arrival_class_grants integer;
  v_messaging_policies integer;
  v_marketplace_policies integer;
  v_campaigns integer;
begin
  if p_game_session_id is null or p_staff_user_id is null then
    raise exception 'GAME_PROVISIONING_VERIFICATION_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  select * into v_game
  from public.game_sessions
  where id = p_game_session_id
    and owner_staff_user_id = p_staff_user_id;

  if not found
     or v_game.status <> 'active'
     or v_game.provisioning_status <> 'ready'
     or v_game.provisioning_pack_id <> 'econovaria.beta-seed-pack.v1'
     or v_game.provisioned_at is null
  then
    raise exception 'GAME_PROVISIONING_VERIFICATION_FAILED' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_market_assets
  from public.game_session_stock_assets
  where game_session_id = p_game_session_id and is_active;

  select count(*)::integer into v_contracts
  from public.game_session_contracts
  where game_session_id = p_game_session_id and status = 'active' and visibility = 'public';

  select count(*)::integer into v_store_items
  from public.store_items
  where game_session_id = p_game_session_id and status = 'active' and visibility = 'visible';

  select count(*)::integer into v_world_locations
  from public.world_location_states
  where game_session_id = p_game_session_id;

  select count(*)::integer into v_world_routes
  from public.world_route_states
  where game_session_id = p_game_session_id;

  select count(*)::integer into v_world_countries
  from public.world_country_runtime
  where game_session_id = p_game_session_id;

  select count(*)::integer into v_arrival_class_grants
  from public.arrival_class_grant_runtime
  where game_session_id = p_game_session_id;

  select count(*)::integer into v_messaging_policies
  from public.message_game_policies
  where game_session_id = p_game_session_id;

  select count(*)::integer into v_marketplace_policies
  from public.marketplace_policies
  where game_session_id = p_game_session_id;

  select count(*)::integer into v_campaigns
  from public.campaign_instances as campaign_row
  where campaign_row.game_session_id = p_game_session_id
    and campaign_row.pack_id = v_game.provisioning_pack_id
    and campaign_row.pack_version = v_game.provisioning_pack_version
    and campaign_row.status in ('active','paused','emergency_disabled','completed')
    and exists (
      select 1
      from public.campaign_program_definitions as program_row
      where program_row.pack_id = campaign_row.pack_id
        and program_row.pack_version = campaign_row.pack_version
        and program_row.definition_id = campaign_row.definition_id
        and program_row.definition_digest = campaign_row.definition_digest
    );

  if v_market_assets <> 240
     or v_contracts < 30
     or v_store_items < 50
     or v_world_locations <> 50
     or v_world_routes <> 13
     or v_world_countries <> 10
     or v_arrival_class_grants <> 8
     or v_messaging_policies <> 1
     or v_marketplace_policies <> 1
     or v_campaigns <> 1
     or not exists (
       select 1 from public.seed_content_releases
       where game_session_id = p_game_session_id
         and pack_id = 'econovaria.beta-seed-pack.v1'
         and status = 'applied_active'
     )
     or not exists (
       select 1 from public.world_runtime_instances
       where game_session_id = p_game_session_id
     )
     or not exists (
       select 1 from public.game_feature_activation_evidence
       where game_session_id = p_game_session_id
         and story_status = 'active'
         and arrival_grant_status = 'active'
         and progression_status = 'active'
     )
  then
    raise exception 'GAME_PROVISIONING_VERIFICATION_FAILED' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ready', true,
    'gameSessionId', v_game.id,
    'provisioningStatus', v_game.provisioning_status,
    'packId', v_game.provisioning_pack_id,
    'packVersion', v_game.provisioning_pack_version,
    'counts', jsonb_build_object(
      'marketAssets', v_market_assets,
      'contracts', v_contracts,
      'storeItems', v_store_items,
      'worldLocations', v_world_locations,
      'worldRoutes', v_world_routes,
      'worldCountries', v_world_countries,
      'arrivalClassGrants', v_arrival_class_grants,
      'messagingPolicies', v_messaging_policies,
      'marketplacePolicies', v_marketplace_policies,
      'campaignInstances', v_campaigns
    )
  );
end;
$function$;

revoke all on function public.verify_provisioned_game_v1(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.verify_provisioned_game_v1(uuid,uuid)
  to service_role;

comment on function public.verify_provisioned_game_v1(uuid,uuid) is
  'Verifies full-game readiness including exactly one digest-pinned Campaign. Retiring an immutable program blocks new selection but does not invalidate games already pinned to that definition.';

commit;
