-- Player-facing Business equipment candidates and guarded Store publication.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Authority writers lock Business before changing ownership or mandates. Acquire
-- that lock before resolving the controller, in a fresh statement, so revocation
-- cannot occur between authorization and any canonical mutation below.
create or replace function private.lock_business_player_loop_authority_v1(
  p_game_session_id uuid, p_player_id uuid, p_business_key text
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare v_business_id uuid; v_owned record;
begin
  perform 1 from public.game_sessions where id = p_game_session_id and status = 'active' and lifecycle_state = 'active' for share;
  if not found then raise exception 'GAME_SESSION_NOT_ACTIVE'; end if;
  perform 1 from public.players where game_session_id = p_game_session_id and id = p_player_id and status = 'active' for share;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select id into v_business_id from public.business_entities
    where game_session_id = p_game_session_id and public_key = p_business_key and status = 'active' for share;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;
  select * into v_owned from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  if v_owned.business_id is distinct from v_business_id then raise exception 'BUSINESS_NOT_FOUND'; end if;
  return v_business_id;
end $function$;
revoke all on function private.lock_business_player_loop_authority_v1(uuid,uuid,text) from public, anon, authenticated, service_role;

create or replace function public.install_owned_business_equipment_v3(
  p_game_session_id uuid, p_player_id uuid, p_business_key text, p_equipment_key text, p_idempotency_key text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare v_result jsonb;
begin
  perform private.lock_business_player_loop_authority_v1(p_game_session_id, p_player_id, p_business_key);
  select to_jsonb(installed) into v_result from public.install_owned_business_equipment_v2(p_game_session_id, p_player_id, p_business_key, p_equipment_key, p_idempotency_key) installed;
  return v_result;
end $function$;
revoke all on function public.install_owned_business_equipment_v3(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.install_owned_business_equipment_v3(uuid,uuid,text,text,text) to service_role;

create or replace function public.create_owned_business_store_offer_draft_v1(
  p_game_session_id uuid, p_player_id uuid, p_business_key text, p_store_item_key text, p_unit_price numeric, p_idempotency_key text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  perform private.lock_business_player_loop_authority_v1(p_game_session_id, p_player_id, p_business_key);
  return public.create_business_store_offer_draft_v2(p_game_session_id, p_business_key, p_store_item_key, p_unit_price, p_idempotency_key);
end $function$;
revoke all on function public.create_owned_business_store_offer_draft_v1(uuid,uuid,text,text,numeric,text) from public, anon, authenticated;
grant execute on function public.create_owned_business_store_offer_draft_v1(uuid,uuid,text,text,numeric,text) to service_role;

create or replace function public.stock_owned_business_store_offer_v1(
  p_game_session_id uuid, p_player_id uuid, p_business_key text, p_offer_key text, p_quantity integer, p_expected_offer_version bigint, p_idempotency_key text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  perform private.lock_business_player_loop_authority_v1(p_game_session_id, p_player_id, p_business_key);
  return public.stock_business_store_offer_v2(p_game_session_id, p_business_key, p_offer_key, p_quantity, p_expected_offer_version, p_idempotency_key);
end $function$;
revoke all on function public.stock_owned_business_store_offer_v1(uuid,uuid,text,text,integer,bigint,text) from public, anon, authenticated;
grant execute on function public.stock_owned_business_store_offer_v1(uuid,uuid,text,text,integer,bigint,text) to service_role;

create or replace function public.publish_owned_business_store_offer_v1(
  p_game_session_id uuid, p_player_id uuid, p_business_key text,
  p_offer_key text, p_expected_offer_version bigint, p_idempotency_key text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_business_id uuid;
  v_offer public.store_seller_offers%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_hash text;
  v_result jsonb;
begin
  if p_game_session_id is null or p_player_id is null
    or coalesce(p_business_key, '') !~ '^biz_[0-9a-f]{32}$'
    or coalesce(p_offer_key, '') !~ '^sof_[0-9a-f]{32}$'
    or p_expected_offer_version is null or p_expected_offer_version < 1
    or coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9._:-]{8,160}$'
  then raise exception 'BUSINESS_OFFER_PUBLISH_REQUEST_INVALID'; end if;
  v_business_id := private.lock_business_player_loop_authority_v1(p_game_session_id, p_player_id, p_business_key);
  v_hash := encode(extensions.digest(concat_ws('|', p_game_session_id, p_player_id, p_business_key, p_offer_key, p_expected_offer_version), 'sha256'), 'hex');
  insert into public.mutation_idempotency_keys(game_session_id, player_id, route_key, idempotency_key, request_hash, status, expires_at)
  values(p_game_session_id, p_player_id, 'players.me.business.store.offers.publish', p_idempotency_key, v_hash, 'STARTED', statement_timestamp() + interval '7 days')
  on conflict on constraint mutation_idempotency_keys_scope_unique do nothing;
  select * into v_idempotency from public.mutation_idempotency_keys
  where game_session_id = p_game_session_id and player_id = p_player_id
    and route_key = 'players.me.business.store.offers.publish' and idempotency_key = p_idempotency_key for update;
  if v_idempotency.request_hash <> v_hash then raise exception 'IDEMPOTENCY_KEY_CONFLICT'; end if;
  if v_idempotency.status = 'COMPLETED' then return v_idempotency.response_body || '{"replayed":true}'::jsonb; end if;
  select offer.* into v_offer from public.store_seller_offers offer
  join public.economic_parties party on party.id = offer.seller_party_id and party.game_session_id = offer.game_session_id
  join public.business_entities business on business.id = party.business_id and business.game_session_id = party.game_session_id
  where offer.game_session_id = p_game_session_id and offer.public_key = p_offer_key
    and offer.seller_kind = 'business' and party.party_kind = 'business' and party.status = 'active'
    and business.id = v_business_id and business.status = 'active' for update of offer;
  if not found then raise exception 'STORE_SELLER_OFFER_NOT_FOUND'; end if;
  if v_offer.version <> p_expected_offer_version then raise exception 'STORE_SELLER_OFFER_VERSION_CONFLICT'; end if;
  if v_offer.status not in ('draft', 'paused') then raise exception 'BUSINESS_OFFER_PUBLISH_STATUS_INVALID'; end if;
  if not exists (select 1 from public.inventory_holdings h
    where h.game_session_id = p_game_session_id and h.inventory_account_id = v_offer.inventory_account_id
      and h.game_item_id = v_offer.game_item_id and h.quantity_owned > h.quantity_reserved)
  then raise exception 'BUSINESS_OFFER_PUBLISH_STOCK_UNAVAILABLE'; end if;
  v_result := public.mutate_store_seller_offer_v2(p_game_session_id, p_offer_key, p_expected_offer_version, null, 'active', null) || '{"replayed":false}'::jsonb;
  update public.mutation_idempotency_keys set status = 'COMPLETED', result_type = 'business_store_offer', result_id = v_offer.id, response_body = v_result, completed_at = statement_timestamp() where id = v_idempotency.id;
  return v_result;
end $function$;
revoke all on function public.publish_owned_business_store_offer_v1(uuid,uuid,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.publish_owned_business_store_offer_v1(uuid,uuid,text,text,bigint,text) to service_role;

create or replace function public.read_owned_business_player_loop_options_v1(p_game_session_id uuid, p_player_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare v_business record; v_equipment jsonb; v_products jsonb;
begin
  select * into v_business from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  select coalesce(jsonb_agg(jsonb_build_object('equipmentKey', e.public_id, 'itemKey', i.public_key, 'canonicalKey', i.canonical_key, 'name', i.name) order by i.name, e.public_id), '[]'::jsonb) into v_equipment
  from public.equipment_instances e
  join public.inventory_accounts a on a.id = e.inventory_account_id and a.game_session_id = e.game_session_id
  join public.economic_parties p on p.id = a.party_id and p.game_session_id = a.game_session_id
  join public.game_items i on i.id = e.game_item_id and i.game_session_id = e.game_session_id
  where e.game_session_id = p_game_session_id and e.status = 'active' and e.player_id is null and e.equipped_slot is null
    and a.account_kind = 'warehouse' and a.status = 'active' and p.party_kind = 'business' and p.business_id = v_business.business_id and p.status = 'active'
    and i.item_class = 'equipment' and i.serialized and i.status = 'active' and i.physical_item_definition_id is not null
    and not exists (select 1 from public.business_equipment_installations b where b.game_session_id = p_game_session_id and b.equipment_instance_id = e.id);
  select coalesce(jsonb_agg(jsonb_build_object('itemKey', s.item_key, 'catalogItemKey', i.public_key, 'name', s.name, 'currencyCode', s.currency_code) order by s.name, s.item_key), '[]'::jsonb) into v_products
  from public.store_items s join public.game_items i on i.game_session_id = s.game_session_id and i.id = s.game_item_id join public.business_entities b on b.game_session_id = s.game_session_id and b.id = v_business.business_id
  where s.game_session_id = p_game_session_id and s.status = 'active' and s.visibility = 'visible' and s.currency_code = b.currency_code
    and exists (select 1 from public.business_products p where p.game_session_id = s.game_session_id and p.business_id = b.id and p.output_game_item_id = s.game_item_id and p.product_kind = 'physical_good' and p.status = 'active');
  return jsonb_build_object('availableEquipment', v_equipment, 'saleableStoreItems', v_products);
end $function$;
revoke all on function public.read_owned_business_player_loop_options_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_owned_business_player_loop_options_v1(uuid,uuid) to service_role;
commit;
