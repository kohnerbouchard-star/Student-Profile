-- Business V2 Phase 5A: canonical Business equipment capacity foundation.
-- Additive, forward-only, and intentionally excludes timed manufacturing and maintenance settlement.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.materialize_owned_business_equipment_instance_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_item_key text,
  p_idempotency_key text
)
returns table (
  business_key text,
  equipment_key text,
  item_key text,
  canonical_key text,
  status text,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, economy_private, extensions, pg_temp
as $function$
declare
  v_business record;
  v_party public.economic_parties%rowtype;
  v_account public.inventory_accounts%rowtype;
  v_item public.game_items%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_definition public.physical_economy_item_definitions%rowtype;
  v_instance public.equipment_instances%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_hash text;
  v_instance_count integer;
  v_now timestamptz := statement_timestamp();
begin
  if p_game_session_id is null or p_player_id is null
    or coalesce(p_business_key, '') !~ '^biz_[0-9a-f]{32}$'
    or coalesce(p_item_key, '') !~ '^itm_[0-9a-f]{32}$'
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160
  then
    raise exception 'BUSINESS_EQUIPMENT_MATERIALIZE_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  if v_business.business_key is distinct from lower(btrim(p_business_key))
    or not exists (
      select 1 from public.business_entities as active_business
      where active_business.game_session_id = p_game_session_id
        and active_business.id = v_business.business_id
        and active_business.status = 'active'
    )
  then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_hash := encode(
    extensions.digest(
      concat_ws('|', p_game_session_id, p_player_id, v_business.business_id, lower(btrim(p_item_key))),
      'sha256'
    ),
    'hex'
  );

  insert into public.mutation_idempotency_keys (
    game_session_id, player_id, route_key, idempotency_key,
    request_hash, status, expires_at
  ) values (
    p_game_session_id, p_player_id,
    'players.me.business.equipment.materialize',
    btrim(p_idempotency_key), v_hash, 'STARTED', v_now + interval '7 days'
  )
  on conflict on constraint mutation_idempotency_keys_scope_unique do nothing;

  select idempotency_row.*
  into v_idempotency
  from public.mutation_idempotency_keys as idempotency_row
  where idempotency_row.game_session_id = p_game_session_id
    and idempotency_row.player_id = p_player_id
    and idempotency_row.route_key = 'players.me.business.equipment.materialize'
    and idempotency_row.idempotency_key = btrim(p_idempotency_key)
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_IDEMPOTENCY_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_idempotency.request_hash <> v_hash then
    raise exception 'BUSINESS_EQUIPMENT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;

  if v_idempotency.status = 'COMPLETED' then
    select instance_row.*
    into v_instance
    from public.equipment_instances as instance_row
    where instance_row.game_session_id = p_game_session_id
      and instance_row.id = v_idempotency.result_id;
    if not found then
      raise exception 'BUSINESS_EQUIPMENT_REPLAY_MISSING' using errcode = 'P0001';
    end if;
    select item_row.*
    into v_item
    from public.game_items as item_row
    where item_row.game_session_id = p_game_session_id
      and item_row.id = v_instance.game_item_id;
    return query select
      v_business.business_key,
      v_instance.public_id,
      v_item.public_key,
      v_item.canonical_key,
      v_instance.status,
      true;
    return;
  end if;

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.party_kind = 'business'
    and party_row.business_id = v_business.business_id
    and party_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_PARTY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select account_row.*
  into v_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.party_id = v_party.id
    and account_row.account_kind = 'warehouse'
    and account_row.location_key is null
    and account_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_WAREHOUSE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select item_row.*
  into v_item
  from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.public_key = lower(btrim(p_item_key))
    and item_row.item_class = 'equipment'
    and item_row.serialized
    and item_row.status = 'active'
  for share;
  if not found or v_item.physical_item_definition_id is null then
    raise exception 'BUSINESS_EQUIPMENT_ITEM_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select definition_row.*
  into v_definition
  from public.physical_economy_item_definitions as definition_row
  where definition_row.id = v_item.physical_item_definition_id
    and definition_row.item_class = 'equipment'
    and definition_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_DEFINITION_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_account.id
    and holding_row.game_item_id = v_item.id
  for update;
  if not found or v_holding.quantity_owned <= 0 then
    raise exception 'BUSINESS_EQUIPMENT_NOT_OWNED' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_instance_count
  from public.equipment_instances as instance_row
  where instance_row.game_session_id = p_game_session_id
    and instance_row.inventory_account_id = v_account.id
    and instance_row.game_item_id = v_item.id
    and instance_row.status in ('active','reserved');

  if v_instance_count >= v_holding.quantity_owned then
    raise exception 'BUSINESS_EQUIPMENT_ALL_UNITS_MATERIALIZED' using errcode = 'P0001';
  end if;

  insert into public.equipment_instances (
    game_session_id,
    player_id,
    store_item_id,
    item_key,
    inventory_account_id,
    game_item_id,
    status,
    equipped_slot,
    bonuses
  ) values (
    p_game_session_id,
    null,
    v_holding.store_item_id,
    v_item.canonical_key,
    v_account.id,
    v_item.id,
    'active',
    null,
    coalesce(v_definition.metadata->'bonuses', '{}'::jsonb)
  )
  returning * into v_instance;

  insert into public.audit_log (
    game_session_id, actor_type, actor_id, action,
    target_type, target_id, metadata
  ) values (
    p_game_session_id, 'player', p_player_id,
    'business.equipment.materialized', 'equipment_instance', v_instance.id,
    jsonb_build_object(
      'businessKey', v_business.business_key,
      'equipmentKey', v_instance.public_id,
      'itemKey', v_item.public_key,
      'canonicalKey', v_item.canonical_key,
      'idempotencyKey', btrim(p_idempotency_key),
      'durabilityEnabled', false,
      'repairEnabled', false
    )
  );

  update public.mutation_idempotency_keys
  set
    status = 'COMPLETED',
    result_type = 'equipment_instance',
    result_id = v_instance.id,
    response_body = jsonb_build_object(
      'businessKey', v_business.business_key,
      'equipmentKey', v_instance.public_id,
      'itemKey', v_item.public_key,
      'canonicalKey', v_item.canonical_key,
      'status', v_instance.status
    ),
    completed_at = v_now
  where id = v_idempotency.id;

  return query select
    v_business.business_key,
    v_instance.public_id,
    v_item.public_key,
    v_item.canonical_key,
    v_instance.status,
    false;
end
$function$;

revoke all on function public.materialize_owned_business_equipment_instance_v2(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.materialize_owned_business_equipment_instance_v2(
  uuid, uuid, text, text, text
) to service_role;

commit;
