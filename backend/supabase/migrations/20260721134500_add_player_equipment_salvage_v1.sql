-- Player salvage, deterministic recovery, and recraft cooldown.
-- Final controller-assigned Crafting migration identity.

create or replace function public.salvage_player_equipment_v1(
  p_game_session_id uuid,p_player_id uuid,p_equipment_public_id text,p_idempotency_key text
)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $function$
declare
  v_pack_id uuid;
  v_equipment public.equipment_instances%rowtype;
  v_rule public.physical_economy_salvage_rules%rowtype;
  v_existing public.equipment_salvage_jobs%rowtype;
  v_job public.equipment_salvage_jobs%rowtype;
  v_output jsonb;
  v_item_key text;
  v_quantity integer;
  v_store_item public.store_items%rowtype;
  v_hash text;
  v_results jsonb:='[]'::jsonb;
  v_now timestamptz:=statement_timestamp();
begin
  if coalesce(p_equipment_public_id,'') !~ '^eqp_[0-9a-f]{32}$'
    or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then raise exception 'SALVAGE_REQUEST_INVALID' using errcode='P0001'; end if;
  v_hash:=md5(p_equipment_public_id);
  select * into v_existing from public.equipment_salvage_jobs
  where game_session_id=p_game_session_id and player_id=p_player_id and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.request_hash<>v_hash then raise exception 'SALVAGE_IDEMPOTENCY_CONFLICT' using errcode='P0001'; end if;
    return jsonb_build_object('outcome','replayed','salvageKey',v_existing.public_id,'status',v_existing.status,'outputs',v_existing.outputs,
      'committed',true,'refreshRequired',true);
  end if;

  perform public.assert_player_crafting_mutation_allowed_v1(p_game_session_id,p_player_id);

  select * into v_equipment from public.equipment_instances
  where game_session_id=p_game_session_id and player_id=p_player_id and public_id=p_equipment_public_id for update;
  if not found or v_equipment.status<>'active' or v_equipment.equipped_slot is not null
  then raise exception 'SALVAGE_EQUIPMENT_UNAVAILABLE' using errcode='P0001'; end if;
  select gp.pack_id into v_pack_id from public.game_session_physical_economy_packs gp
  where gp.game_session_id=p_game_session_id and gp.status='active';
  select * into v_rule from public.physical_economy_salvage_rules
  where pack_id=v_pack_id and equipment_item_key=v_equipment.item_key and enabled for share;
  if not found then raise exception 'SALVAGE_RULE_UNAVAILABLE' using errcode='P0001'; end if;

  for v_output in select value from jsonb_array_elements(v_rule.outputs)
  loop
    v_item_key:=lower(v_output->>'itemKey');
    v_quantity:=greatest(0,(v_output->>'quantity')::integer);
    if v_quantity=0 then continue; end if;
    select * into v_store_item from public.store_items
    where game_session_id=p_game_session_id and item_key=v_item_key and status='active' for share;
    if not found then raise exception 'SALVAGE_OUTPUT_ITEM_UNAVAILABLE:%',v_item_key using errcode='P0001'; end if;
    insert into public.inventory_holdings (
      game_session_id,player_id,store_item_id,quantity_owned,quantity_reserved
    ) values (p_game_session_id,p_player_id,v_store_item.id,v_quantity,0)
    on conflict (game_session_id,player_id,store_item_id) do update
      set quantity_owned=public.inventory_holdings.quantity_owned+excluded.quantity_owned,updated_at=v_now;
    insert into public.inventory_events (
      game_session_id,player_id,store_item_id,quantity_delta,event_type,source_domain,source_action,source_id,metadata
    ) values (
      p_game_session_id,p_player_id,v_store_item.id,v_quantity,'ADJUSTED','equipment','salvaged',v_equipment.id,
      jsonb_build_object('equipmentKey',v_equipment.public_id,'itemKey',v_item_key,'quantity',v_quantity,
        'recoveryCapBasisPoints',v_rule.recovery_cap_basis_points)
    );
    v_results:=v_results||jsonb_build_array(jsonb_build_object('itemKey',v_item_key,'quantity',v_quantity));
  end loop;

  update public.inventory_holdings set quantity_owned=quantity_owned-1,updated_at=v_now
  where game_session_id=p_game_session_id and player_id=p_player_id and store_item_id=v_equipment.store_item_id
    and quantity_owned-quantity_reserved>=1;
  if not found then raise exception 'SALVAGE_INVENTORY_PROJECTION_INVALID' using errcode='P0001'; end if;
  insert into public.inventory_events (
    game_session_id,player_id,store_item_id,quantity_delta,event_type,source_domain,source_action,source_id,metadata
  ) values (
    p_game_session_id,p_player_id,v_equipment.store_item_id,-1,'USED','equipment','salvaged',v_equipment.id,
    jsonb_build_object('equipmentKey',v_equipment.public_id,'itemKey',v_equipment.item_key)
  );
  update public.equipment_instances set status='salvaged',salvaged_at=v_now where id=v_equipment.id;

  insert into public.equipment_salvage_jobs (
    game_session_id,player_id,equipment_instance_id,idempotency_key,request_hash,status,outputs,settled_at
  ) values (
    p_game_session_id,p_player_id,v_equipment.id,p_idempotency_key,v_hash,'settled',v_results,v_now
  ) returning * into v_job;
  return jsonb_build_object('outcome','settled','salvageKey',v_job.public_id,'status','settled','outputs',v_results,
    'recraftAvailableAt',v_now+make_interval(secs=>v_rule.recraft_cooldown_seconds),
    'committed',true,'refreshRequired',true);
end
$function$;
