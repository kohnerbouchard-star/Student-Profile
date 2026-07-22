-- Player consumable effects, immutable history, salvage, and recraft cooldown.
-- Final controller-assigned Crafting migration identity.

create or replace function public.use_player_inventory_item_effect_v1(
  p_game_session_id uuid,p_player_id uuid,p_item_key text,p_target_key text,p_idempotency_key text
)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $function$
declare
  v_pack_id uuid;
  v_item public.physical_economy_item_definitions%rowtype;
  v_effect public.physical_economy_effect_definitions%rowtype;
  v_store_item public.store_items%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_existing public.item_use_requests%rowtype;
  v_use public.item_use_requests%rowtype;
  v_grant public.item_effect_grants%rowtype;
  v_active public.item_effect_grants%rowtype;
  v_had_active boolean := false;
  v_hash text;
  v_now timestamptz:=statement_timestamp();
  v_until timestamptz;
  v_cooldown timestamptz;
  v_action text:='applied';
begin
  p_item_key:=lower(btrim(coalesce(p_item_key,'')));
  p_target_key:=nullif(btrim(coalesce(p_target_key,'')),'');
  if p_item_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or length(coalesce(p_target_key,''))>128
  then raise exception 'ITEM_EFFECT_USE_INVALID' using errcode='P0001'; end if;
  v_hash:=md5(p_item_key||':'||coalesce(p_target_key,''));

  select * into v_existing from public.item_use_requests
  where game_session_id=p_game_session_id and player_id=p_player_id
    and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.request_hash<>v_hash then raise exception 'ITEM_EFFECT_IDEMPOTENCY_CONFLICT' using errcode='P0001'; end if;
    return v_existing.response_body||jsonb_build_object('outcome','replayed');
  end if;

  perform public.assert_player_crafting_mutation_allowed_v1(p_game_session_id,p_player_id);

  select gp.pack_id into v_pack_id from public.game_session_physical_economy_packs gp
  where gp.game_session_id=p_game_session_id and gp.status='active';
  select * into v_item from public.physical_economy_item_definitions
  where pack_id=v_pack_id and item_key=p_item_key and item_class='consumable' and status='active';
  if not found or not v_item.effect_enabled then raise exception 'ITEM_EFFECT_UNSUPPORTED' using errcode='P0001'; end if;
  select * into v_effect from public.physical_economy_effect_definitions
  where pack_id=v_pack_id and effect_code=v_item.effect_code and enabled for share;
  if not found or v_effect.effect_kind='disabled_repair' or public.physical_economy_safe_effect_handler_v1(v_effect.effect_code) is null
  then raise exception 'ITEM_EFFECT_UNSUPPORTED' using errcode='P0001'; end if;

  select * into v_store_item from public.store_items
  where game_session_id=p_game_session_id and item_key=p_item_key and status='active' for share;
  if not found then raise exception 'ITEM_EFFECT_ITEM_UNAVAILABLE' using errcode='P0001'; end if;
  select * into v_holding from public.inventory_holdings
  where game_session_id=p_game_session_id and player_id=p_player_id and store_item_id=v_store_item.id for update;
  if not found or v_holding.quantity_owned-v_holding.quantity_reserved<1
  then raise exception 'ITEM_EFFECT_ITEM_UNAVAILABLE' using errcode='P0001'; end if;

  select * into v_active from public.item_effect_grants
  where game_session_id=p_game_session_id and player_id=p_player_id and effect_definition_id=v_effect.id
    and coalesce(target_key,'')=coalesce(p_target_key,'') and status='active'
    and (active_until is null or active_until>v_now)
  order by created_at desc limit 1 for update;
  v_had_active := found;
  if v_had_active and v_active.cooldown_until is not null and v_active.cooldown_until>v_now
  then raise exception 'ITEM_EFFECT_COOLDOWN_ACTIVE' using errcode='P0001'; end if;
  if v_had_active and v_effect.stacking_rule='nonstacking'
  then raise exception 'ITEM_EFFECT_ALREADY_ACTIVE' using errcode='P0001'; end if;

  v_until:=case when v_effect.duration_seconds=0 then null else v_now+make_interval(secs=>v_effect.duration_seconds) end;
  v_cooldown:=case when v_effect.cooldown_seconds=0 then null else v_now+make_interval(secs=>v_effect.cooldown_seconds) end;

  insert into public.item_use_requests (
    game_session_id,player_id,store_item_id,item_key,effect_code,target_key,idempotency_key,request_hash,status,response_body
  ) values (
    p_game_session_id,p_player_id,v_store_item.id,p_item_key,v_effect.effect_code,p_target_key,
    p_idempotency_key,v_hash,'applied','{}'::jsonb
  ) returning * into v_use;

  update public.inventory_holdings set quantity_owned=quantity_owned-1,updated_at=v_now where id=v_holding.id;
  insert into public.inventory_events (
    game_session_id,player_id,store_item_id,quantity_delta,event_type,source_domain,source_action,source_id,metadata
  ) values (
    p_game_session_id,p_player_id,v_store_item.id,-1,'USED','item_effects','effect_applied',v_use.id,
    jsonb_build_object('useKey',v_use.public_id,'itemKey',p_item_key,'effectCode',v_effect.effect_code)
  );

  if v_had_active and v_effect.stacking_rule in ('refresh','max','add_bounded','replace') then
    if v_effect.stacking_rule='add_bounded' then
      update public.item_effect_grants set stack_count=least(v_effect.max_stacks,stack_count+1),
        active_until=v_until,cooldown_until=v_cooldown,updated_at=v_now where id=v_active.id returning * into v_grant;
      v_action:='stacked';
    elsif v_effect.stacking_rule='max' then
      update public.item_effect_grants set active_until=case when active_until is null or v_until is null then null else greatest(active_until,v_until) end,
        cooldown_until=v_cooldown,updated_at=v_now where id=v_active.id returning * into v_grant;
      v_action:='refreshed';
    else
      update public.item_effect_grants set status='revoked',updated_at=v_now where id=v_active.id;
      insert into public.item_effect_grants (
        game_session_id,player_id,effect_definition_id,effect_code,scope,target_key,stack_count,status,
        active_from,active_until,cooldown_until,source_use_id,public_payload
      ) values (
        p_game_session_id,p_player_id,v_effect.id,v_effect.effect_code,v_effect.scope,p_target_key,1,'active',
        v_now,v_until,v_cooldown,v_use.id,
        jsonb_build_object('handler',v_effect.handler_code,'summary',v_effect.public_summary)
      ) returning * into v_grant;
      v_action:=case when v_effect.stacking_rule='replace' then 'replaced' else 'refreshed' end;
    end if;
  else
    insert into public.item_effect_grants (
      game_session_id,player_id,effect_definition_id,effect_code,scope,target_key,stack_count,status,
      active_from,active_until,cooldown_until,source_use_id,public_payload
    ) values (
      p_game_session_id,p_player_id,v_effect.id,v_effect.effect_code,v_effect.scope,p_target_key,1,'active',
      v_now,v_until,v_cooldown,v_use.id,
      jsonb_build_object('handler',v_effect.handler_code,'summary',v_effect.public_summary)
    ) returning * into v_grant;
  end if;

  insert into public.item_effect_history (
    game_session_id,player_id,effect_grant_id,item_use_id,effect_code,action,actor_type,actor_id,summary,metadata
  ) values (
    p_game_session_id,p_player_id,v_grant.id,v_use.id,v_effect.effect_code,v_action,'player',p_player_id,
    v_effect.public_summary,jsonb_build_object('itemKey',p_item_key,'targetKey',p_target_key,'stackCount',v_grant.stack_count)
  );

  update public.item_use_requests set response_body=jsonb_build_object(
    'outcome','applied','useKey',v_use.public_id,'effectKey',v_grant.public_id,
    'effectCode',v_grant.effect_code,'scope',v_grant.scope,'targetKey',v_grant.target_key,
    'stackCount',v_grant.stack_count,'activeUntil',v_grant.active_until,'cooldownUntil',v_grant.cooldown_until,
    'committed',true,'refreshRequired',true
  ) where id=v_use.id returning * into v_use;
  return v_use.response_body;
end
$function$;
