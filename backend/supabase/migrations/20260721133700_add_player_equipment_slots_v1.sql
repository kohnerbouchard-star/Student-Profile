-- Player equipment slot assignment and bonuses.
-- Final controller-assigned Crafting migration identity.

create or replace function public.set_player_equipment_slot_v1(
  p_game_session_id uuid,p_player_id uuid,p_equipment_public_id text,p_slot text,p_idempotency_key text
)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $function$
declare
  v_equipment public.equipment_instances%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_allowed_slot text;
  v_slot text:=nullif(lower(btrim(coalesce(p_slot,''))),'');
  v_hash text;
  v_response jsonb;
  v_now timestamptz:=statement_timestamp();
begin
  if coalesce(p_equipment_public_id,'') !~ '^eqp_[0-9a-f]{32}$'
    or (v_slot is not null and v_slot not in ('field','utility','analysis','operations'))
    or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then raise exception 'EQUIPMENT_SLOT_REQUEST_INVALID' using errcode='P0001'; end if;

  v_hash:=md5(p_equipment_public_id||':'||coalesce(v_slot,''));
  insert into public.mutation_idempotency_keys (
    game_session_id,player_id,route_key,idempotency_key,request_hash,status,expires_at
  ) values (
    p_game_session_id,p_player_id,'players.me.equipment.slot',p_idempotency_key,v_hash,'STARTED',v_now+interval '24 hours'
  ) on conflict (game_session_id,player_id,route_key,idempotency_key) do nothing;

  select * into v_idempotency from public.mutation_idempotency_keys
  where game_session_id=p_game_session_id and player_id=p_player_id
    and route_key='players.me.equipment.slot' and idempotency_key=p_idempotency_key
  for update;
  if not found then raise exception 'EQUIPMENT_IDEMPOTENCY_UNAVAILABLE' using errcode='P0001'; end if;
  if v_idempotency.request_hash<>v_hash then
    raise exception 'EQUIPMENT_IDEMPOTENCY_CONFLICT' using errcode='P0001';
  end if;
  if v_idempotency.status='COMPLETED' and v_idempotency.response_body is not null then
    return v_idempotency.response_body||jsonb_build_object('outcome','replayed');
  end if;

  perform public.assert_player_crafting_mutation_allowed_v1(p_game_session_id,p_player_id);

  select * into v_equipment from public.equipment_instances
  where game_session_id=p_game_session_id and player_id=p_player_id
    and public_id=p_equipment_public_id and status='active' for update;
  if not found then raise exception 'EQUIPMENT_NOT_FOUND' using errcode='P0001'; end if;
  select d.equipment_slot into v_allowed_slot
  from public.physical_economy_item_definitions d
  join public.game_session_physical_economy_packs gp on gp.pack_id=d.pack_id
  where gp.game_session_id=p_game_session_id and gp.status='active' and d.item_key=v_equipment.item_key;
  if v_slot is not null and v_slot<>v_allowed_slot then raise exception 'EQUIPMENT_SLOT_INCOMPATIBLE' using errcode='P0001'; end if;
  update public.equipment_instances set equipped_slot=v_slot,equipped_at=case when v_slot is null then null else v_now end
  where id=v_equipment.id returning * into v_equipment;
  insert into public.audit_log (
    game_session_id,actor_type,actor_id,action,target_type,target_id,metadata
  ) values (
    p_game_session_id,'player',p_player_id,
    case when v_slot is null then 'equipment.unequipped' else 'equipment.equipped' end,
    'equipment_instance',v_equipment.id,
    jsonb_build_object('equipmentKey',v_equipment.public_id,'itemKey',v_equipment.item_key,'slot',v_slot,
      'idempotencyKey',p_idempotency_key,'durabilityEnabled',false,'repairEnabled',false)
  );

  v_response:=jsonb_build_object(
    'outcome','applied','equipmentKey',v_equipment.public_id,'itemKey',v_equipment.item_key,
    'slot',v_equipment.equipped_slot,'status',v_equipment.status,
    'committed',true,'refreshRequired',true
  );
  update public.mutation_idempotency_keys set
    status='COMPLETED',result_type='equipment_instance',result_id=v_equipment.id,
    response_body=v_response,completed_at=v_now
  where id=v_idempotency.id;
  return v_response;
exception when unique_violation then
  raise exception 'EQUIPMENT_SLOT_OCCUPIED' using errcode='P0001';
end
$function$;
