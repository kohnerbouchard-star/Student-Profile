begin;

-- New games must never become active until the canonical content pack and
-- feature activation have completed. Existing historical rows are not
-- rewritten; the trigger protects all future inserts and readiness changes.
create or replace function public.enforce_active_game_is_provisioned_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.status = 'active' and coalesce(new.provisioning_status, 'pending') <> 'ready' then
    raise exception 'ACTIVE_GAME_REQUIRES_READY_PROVISIONING' using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_active_game_is_provisioned
  on public.game_sessions;
create trigger enforce_active_game_is_provisioned
before insert or update of status, provisioning_status
on public.game_sessions
for each row execute function public.enforce_active_game_is_provisioned_v1();

-- Fail before creating Auth, Staff, licensing, or game records when the
-- canonical staging source is unavailable or incomplete.
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
  order by release_row.applied_at desc nulls last, release_row.created_at desc
  limit 1;

  if not found then
    raise exception 'GAME_PROVISIONING_CANONICAL_SOURCE_NOT_FOUND' using errcode = 'P0001';
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

  if v_stock_templates <> 240
    or v_game_stock_assets <> 240
    or v_contract_templates <> 30
    or v_game_contracts <> 30
    or v_store_items <> 50
    or v_world_locations <> 50
    or v_world_routes <> 13
    or v_world_countries <> 10
    or v_arrival_class_grants <> 8
    or not exists (
      select 1 from public.world_runtime_instances
      where game_session_id = v_release.game_session_id and revision = 0
    )
  then
    raise exception 'GAME_PROVISIONING_CANONICAL_SOURCE_INCOMPLETE' using errcode = 'P0001';
  end if;

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
begin
  if p_game_session_id is null or p_staff_user_id is null then
    raise exception 'GAME_PROVISIONING_VERIFICATION_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  select * into v_game
  from public.game_sessions
  where id = p_game_session_id and owner_staff_user_id = p_staff_user_id;

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
  from public.world_location_states where game_session_id = p_game_session_id;
  select count(*)::integer into v_world_routes
  from public.world_route_states where game_session_id = p_game_session_id;
  select count(*)::integer into v_world_countries
  from public.world_country_runtime where game_session_id = p_game_session_id;
  select count(*)::integer into v_arrival_class_grants
  from public.arrival_class_grant_runtime where game_session_id = p_game_session_id;
  select count(*)::integer into v_messaging_policies
  from public.message_game_policies where game_session_id = p_game_session_id;
  select count(*)::integer into v_marketplace_policies
  from public.marketplace_policies where game_session_id = p_game_session_id;

  if v_market_assets <> 240
    or v_contracts <> 30
    or v_store_items <> 50
    or v_world_locations <> 50
    or v_world_routes <> 13
    or v_world_countries <> 10
    or v_arrival_class_grants <> 8
    or v_messaging_policies <> 1
    or v_marketplace_policies <> 1
    or not exists (
      select 1 from public.seed_content_releases
      where game_session_id = p_game_session_id
        and pack_id = 'econovaria.beta-seed-pack.v1'
        and status = 'applied_active'
    )
    or not exists (
      select 1 from public.world_runtime_instances
      where game_session_id = p_game_session_id and revision = 0
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
      'marketplacePolicies', v_marketplace_policies
    )
  );
end;
$function$;

-- Licensing activation is also the first-game creation path. It must use the
-- same atomic provisioning authority as later Admin game creation.
create or replace function public.redeem_purchase_code_for_game(
  p_staff_user_id uuid,
  p_purchase_code_hash text,
  p_game_name text,
  p_game_settings jsonb default '{}'::jsonb,
  p_request_metadata jsonb default '{}'::jsonb
)
returns table (
  game_session_id uuid,
  entitlement_id uuid,
  purchase_code_id uuid,
  purchase_code_status text,
  redeemed_count integer,
  max_redemptions integer,
  activated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_purchase_code public.purchase_codes%rowtype;
  v_entitlement public.entitlements%rowtype;
  v_provisioning jsonb;
  v_verification jsonb;
  v_game_session_id uuid;
  v_next_redeemed_count integer;
  v_next_status text;
  v_activated_at timestamptz := now();
  v_idempotency_key text;
begin
  perform public.game_provisioning_preflight_v1('econovaria.beta-seed-pack.v1');

  if p_staff_user_id is null then
    raise exception 'STAFF_USER_REQUIRED' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_purchase_code_hash, ''))) = 0 then
    raise exception 'PURCHASE_CODE_HASH_REQUIRED' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_game_name, ''))) = 0 then
    raise exception 'GAME_NAME_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_purchase_code
  from public.purchase_codes
  where code_hash = btrim(p_purchase_code_hash)
  for update;

  if not found then
    raise exception 'PURCHASE_CODE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_purchase_code.status = 'expired'
    or (v_purchase_code.expires_at is not null and v_purchase_code.expires_at <= v_activated_at)
  then
    raise exception 'PURCHASE_CODE_EXPIRED' using errcode = 'P0001';
  end if;
  if v_purchase_code.status = 'revoked' then
    raise exception 'PURCHASE_CODE_REVOKED' using errcode = 'P0001';
  end if;
  if v_purchase_code.status <> 'active'
    or v_purchase_code.redeemed_count >= v_purchase_code.max_redemptions
  then
    raise exception 'PURCHASE_CODE_EXHAUSTED' using errcode = 'P0001';
  end if;

  v_idempotency_key := 'license:' || encode(
    extensions.digest(
      p_staff_user_id::text || '|' || v_purchase_code.id::text || '|' ||
      btrim(p_game_name) || '|' || coalesce(p_request_metadata, '{}'::jsonb)::text,
      'sha256'
    ),
    'hex'
  );

  v_provisioning := public.create_provisioned_game_v2(
    p_staff_user_id,
    btrim(p_game_name),
    coalesce(p_game_settings, '{}'::jsonb),
    v_idempotency_key,
    'econovaria.beta-seed-pack.v1'
  );

  if coalesce(v_provisioning->>'outcome', '') in ('failed', 'failed_replay')
    or coalesce(v_provisioning->>'provisioningStatus', '') <> 'ready'
    or nullif(v_provisioning->>'gameSessionId', '') is null
  then
    raise exception 'GAME_PROVISIONING_FAILED' using errcode = 'P0001';
  end if;

  v_game_session_id := (v_provisioning->>'gameSessionId')::uuid;
  v_verification := public.verify_provisioned_game_v1(
    v_game_session_id,
    p_staff_user_id
  );

  if coalesce((v_verification->>'ready')::boolean, false) is not true then
    raise exception 'GAME_PROVISIONING_VERIFICATION_FAILED' using errcode = 'P0001';
  end if;

  v_next_redeemed_count := v_purchase_code.redeemed_count + 1;
  v_next_status := case
    when v_next_redeemed_count >= v_purchase_code.max_redemptions then 'exhausted'
    else 'active'
  end;

  update public.purchase_codes
  set redeemed_count = v_next_redeemed_count,
      status = v_next_status
  where id = v_purchase_code.id
    and status = 'active'
    and redeemed_count = v_purchase_code.redeemed_count
  returning * into v_purchase_code;

  if not found then
    raise exception 'PURCHASE_CODE_REDEMPTION_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.entitlements (
    purchase_code_id, staff_user_id, game_session_id, status
  ) values (
    v_purchase_code.id, p_staff_user_id, v_game_session_id, 'active'
  ) returning * into v_entitlement;

  insert into public.audit_log (
    game_session_id, actor_type, actor_id, action, target_type, target_id, metadata
  ) values (
    v_game_session_id,
    'staff_user',
    p_staff_user_id,
    'licensing.purchase_code_redeemed',
    'purchase_code',
    v_purchase_code.id,
    jsonb_build_object(
      'purchase_code_id', v_purchase_code.id,
      'entitlement_id', v_entitlement.id,
      'game_session_id', v_game_session_id,
      'purchase_code_status', v_purchase_code.status,
      'redeemed_count', v_purchase_code.redeemed_count,
      'max_redemptions', v_purchase_code.max_redemptions,
      'provisioning', v_verification,
      'request', coalesce(p_request_metadata, '{}'::jsonb)
    )
  );

  return query select
    v_game_session_id,
    v_entitlement.id,
    v_purchase_code.id,
    v_purchase_code.status,
    v_purchase_code.redeemed_count,
    v_purchase_code.max_redemptions,
    v_activated_at;
end;
$function$;

revoke all on function public.enforce_active_game_is_provisioned_v1()
  from public, anon, authenticated;
revoke all on function public.game_provisioning_preflight_v1(text)
  from public, anon, authenticated;
revoke all on function public.verify_provisioned_game_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.redeem_purchase_code_for_game(uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function public.game_provisioning_preflight_v1(text)
  to service_role;
grant execute on function public.verify_provisioned_game_v1(uuid, uuid)
  to service_role;
grant execute on function public.redeem_purchase_code_for_game(uuid, text, text, jsonb, jsonb)
  to service_role;

comment on function public.game_provisioning_preflight_v1(text) is
  'Fails closed unless the canonical non-production seed source and bounded World content are complete before any game-creation side effects.';
comment on function public.verify_provisioned_game_v1(uuid, uuid) is
  'Verifies that a newly created game is active, provisioned, release-bound, and populated with the exact bounded seed content required by the multiplayer runtime.';
comment on function public.redeem_purchase_code_for_game(uuid, text, text, jsonb, jsonb) is
  'Atomically redeems a purchase code only after canonical V2 game provisioning and verification succeed; failures roll back the game, entitlement, and redemption together.';

commit;
