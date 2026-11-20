-- Business V2 Phase 5A: canonical Business equipment capacity foundation.
-- Additive, forward-only, and intentionally excludes timed manufacturing and maintenance settlement.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.install_owned_business_equipment_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_equipment_key text,
  p_idempotency_key text
)
returns table (
  business_key text,
  installation_key text,
  equipment_key text,
  canonical_key text,
  status text,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_business record;
  v_instance public.equipment_instances%rowtype;
  v_account public.inventory_accounts%rowtype;
  v_party public.economic_parties%rowtype;
  v_item public.game_items%rowtype;
  v_installation public.business_equipment_installations%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_profile_id uuid;
  v_hash text;
  v_now timestamptz := statement_timestamp();
begin
  if p_game_session_id is null or p_player_id is null
    or coalesce(p_business_key, '') !~ '^biz_[0-9a-f]{32}$'
    or coalesce(p_equipment_key, '') !~ '^eqp_[0-9a-f]{32}$'
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160
  then
    raise exception 'BUSINESS_EQUIPMENT_INSTALL_REQUEST_INVALID' using errcode = 'P0001';
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
      concat_ws('|', p_game_session_id, p_player_id, v_business.business_id, lower(btrim(p_equipment_key))),
      'sha256'
    ),
    'hex'
  );

  insert into public.mutation_idempotency_keys (
    game_session_id, player_id, route_key, idempotency_key,
    request_hash, status, expires_at
  ) values (
    p_game_session_id, p_player_id,
    'players.me.business.equipment.install',
    btrim(p_idempotency_key), v_hash, 'STARTED', v_now + interval '7 days'
  )
  on conflict on constraint mutation_idempotency_keys_scope_unique do nothing;

  select idempotency_row.*
  into v_idempotency
  from public.mutation_idempotency_keys as idempotency_row
  where idempotency_row.game_session_id = p_game_session_id
    and idempotency_row.player_id = p_player_id
    and idempotency_row.route_key = 'players.me.business.equipment.install'
    and idempotency_row.idempotency_key = btrim(p_idempotency_key)
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_IDEMPOTENCY_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_idempotency.request_hash <> v_hash then
    raise exception 'BUSINESS_EQUIPMENT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;

  if v_idempotency.status = 'COMPLETED' then
    select installation_row.*
    into v_installation
    from public.business_equipment_installations as installation_row
    where installation_row.game_session_id = p_game_session_id
      and installation_row.id = v_idempotency.result_id;
    if not found then
      raise exception 'BUSINESS_EQUIPMENT_INSTALL_REPLAY_MISSING' using errcode = 'P0001';
    end if;
    select instance_row.*
    into v_instance
    from public.equipment_instances as instance_row
    where instance_row.game_session_id = p_game_session_id
      and instance_row.id = v_installation.equipment_instance_id;
    select item_row.*
    into v_item
    from public.game_items as item_row
    where item_row.game_session_id = p_game_session_id
      and item_row.id = v_instance.game_item_id;
    return query select
      v_business.business_key,
      v_installation.public_key,
      v_instance.public_id,
      v_item.canonical_key,
      v_installation.status,
      true;
    return;
  end if;

  select instance_row.*
  into v_instance
  from public.equipment_instances as instance_row
  where instance_row.game_session_id = p_game_session_id
    and instance_row.public_id = lower(btrim(p_equipment_key))
    and instance_row.status = 'active'
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_INSTANCE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_instance.player_id is not null or v_instance.equipped_slot is not null then
    raise exception 'BUSINESS_EQUIPMENT_INSTANCE_PLAYER_OWNED' using errcode = 'P0001';
  end if;

  select account_row.*
  into v_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_instance.inventory_account_id
    and account_row.account_kind = 'warehouse'
    and account_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_ACCOUNT_INVALID' using errcode = 'P0001';
  end if;

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.id = v_account.party_id
    and party_row.party_kind = 'business'
    and party_row.business_id = v_business.business_id
    and party_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_OWNERSHIP_MISMATCH' using errcode = 'P0001';
  end if;

  select item_row.*
  into v_item
  from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_instance.game_item_id
    and item_row.item_class = 'equipment'
    and item_row.serialized
    and item_row.status = 'active'
  for share;
  if not found or v_item.physical_item_definition_id is null then
    raise exception 'BUSINESS_EQUIPMENT_ITEM_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  v_profile_id := public.ensure_business_equipment_capacity_profile_v2(
    v_item.physical_item_definition_id
  );

  insert into public.business_equipment_installations (
    game_session_id,
    business_id,
    equipment_instance_id,
    capacity_profile_id,
    installed_by_player_id,
    status,
    installed_at
  ) values (
    p_game_session_id,
    v_business.business_id,
    v_instance.id,
    v_profile_id,
    p_player_id,
    'installed',
    v_now
  )
  on conflict on constraint business_equipment_installations_instance_unique
  do nothing
  returning * into v_installation;

  if v_installation.id is null then
    select installation_row.*
    into v_installation
    from public.business_equipment_installations as installation_row
    where installation_row.game_session_id = p_game_session_id
      and installation_row.equipment_instance_id = v_instance.id
    for update;
    if not found
      or v_installation.business_id is distinct from v_business.business_id
      or v_installation.status = 'retired'
    then
      raise exception 'BUSINESS_EQUIPMENT_INSTALLATION_CONFLICT' using errcode = 'P0001';
    end if;
  end if;

  insert into public.audit_log (
    game_session_id, actor_type, actor_id, action,
    target_type, target_id, metadata
  ) values (
    p_game_session_id, 'player', p_player_id,
    'business.equipment.installed', 'business_equipment_installation', v_installation.id,
    jsonb_build_object(
      'businessKey', v_business.business_key,
      'installationKey', v_installation.public_key,
      'equipmentKey', v_instance.public_id,
      'canonicalKey', v_item.canonical_key,
      'idempotencyKey', btrim(p_idempotency_key),
      'durabilityEnabled', false,
      'repairEnabled', false
    )
  );

  update public.mutation_idempotency_keys
  set
    status = 'COMPLETED',
    result_type = 'business_equipment_installation',
    result_id = v_installation.id,
    response_body = jsonb_build_object(
      'businessKey', v_business.business_key,
      'installationKey', v_installation.public_key,
      'equipmentKey', v_instance.public_id,
      'canonicalKey', v_item.canonical_key,
      'status', v_installation.status
    ),
    completed_at = v_now
  where id = v_idempotency.id;

  return query select
    v_business.business_key,
    v_installation.public_key,
    v_instance.public_id,
    v_item.canonical_key,
    v_installation.status,
    false;
end
$function$;

revoke all on function public.install_owned_business_equipment_v2(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.install_owned_business_equipment_v2(
  uuid, uuid, text, text, text
) to service_role;

commit;
