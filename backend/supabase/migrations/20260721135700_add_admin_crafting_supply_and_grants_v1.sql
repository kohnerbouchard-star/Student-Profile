-- Admin physical-economy supply controls and trusted function grants.
-- Final controller-assigned Crafting migration identity.

create or replace function public.apply_admin_physical_economy_supply_v1(
  p_game_session_id uuid,p_staff_user_id uuid,p_item_key text,p_country_code text,
  p_scarcity_band text,p_available_quantity integer,p_event_multiplier numeric,p_route_multiplier numeric,
  p_source_event_key text,p_expires_at timestamptz,p_idempotency_key text
)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $function$
declare
  v_event public.physical_economy_admin_events%rowtype;
  v_supply public.game_session_item_supply%rowtype;
  v_request jsonb;
begin
  p_item_key:=lower(btrim(coalesce(p_item_key,'')));
  p_country_code:=coalesce(nullif(upper(btrim(coalesce(p_country_code,''))),''),'*');
  p_scarcity_band:=lower(btrim(coalesce(p_scarcity_band,'')));
  p_source_event_key:=nullif(btrim(coalesce(p_source_event_key,'')),'');
  p_event_multiplier:=coalesce(p_event_multiplier,1);
  p_route_multiplier:=coalesce(p_route_multiplier,1);
  if p_item_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    or (p_country_code<>'*' and p_country_code !~ '^[A-Z]{3}$')
    or p_scarcity_band not in ('abundant','available','constrained','scarce','unavailable')
    or (p_available_quantity is not null and p_available_quantity<0)
    or p_event_multiplier not between 0.5 and 4
    or p_route_multiplier not between 0.5 and 4
    or (p_source_event_key is not null and p_source_event_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
    or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then raise exception 'PHYSICAL_ECONOMY_SUPPLY_INVALID' using errcode='P0001'; end if;
  if not exists (
    select 1 from public.game_sessions
    where id=p_game_session_id and owner_staff_user_id=p_staff_user_id
      and status='active' and lifecycle_state='active'
  ) then raise exception 'CRAFTING_ADMIN_SCOPE_INVALID' using errcode='P0001'; end if;

  v_request:=jsonb_build_object(
    'itemKey',p_item_key,
    'countryCode',p_country_code,
    'scarcityBand',p_scarcity_band,
    'availableQuantity',p_available_quantity,
    'eventMultiplier',p_event_multiplier,
    'routeMultiplier',p_route_multiplier,
    'sourceEventKey',p_source_event_key,
    'expiresAt',p_expires_at
  );

  select * into v_event from public.physical_economy_admin_events
  where game_session_id=p_game_session_id and staff_user_id=p_staff_user_id
    and action='supply.apply' and idempotency_key=p_idempotency_key for update;
  if found then
    if (v_event.outcome-'version'-'replayed') is distinct from v_request
    then raise exception 'CRAFTING_SUPPLY_IDEMPOTENCY_CONFLICT' using errcode='P0001'; end if;
    return v_event.outcome||jsonb_build_object('replayed',true);
  end if;

  insert into public.game_session_item_supply (
    game_session_id,item_key,country_code,scarcity_band,available_quantity,event_multiplier,
    route_multiplier,source_event_key,effective_at,expires_at,version
  ) values (
    p_game_session_id,p_item_key,p_country_code,p_scarcity_band,p_available_quantity,
    p_event_multiplier,p_route_multiplier,p_source_event_key,
    statement_timestamp(),p_expires_at,1
  )
  on conflict (game_session_id,item_key,country_code) do update set
    scarcity_band=excluded.scarcity_band,available_quantity=excluded.available_quantity,
    event_multiplier=excluded.event_multiplier,route_multiplier=excluded.route_multiplier,
    source_event_key=excluded.source_event_key,effective_at=excluded.effective_at,
    expires_at=excluded.expires_at,version=public.game_session_item_supply.version+1
  returning * into v_supply;

  insert into public.physical_economy_admin_events (
    game_session_id,staff_user_id,action,idempotency_key,target_key,outcome
  ) values (
    p_game_session_id,p_staff_user_id,'supply.apply',p_idempotency_key,p_item_key,
    v_request||jsonb_build_object('version',v_supply.version,'replayed',false)
  ) returning * into v_event;
  return v_event.outcome;
end
$function$;

revoke all on function public.crafting_deterministic_basis_points_v1(text) from public, anon, authenticated;
revoke all on function public.assert_player_crafting_mutation_allowed_v1(uuid,uuid) from public, anon, authenticated;
revoke all on function public.physical_economy_safe_effect_handler_v1(text) from public, anon, authenticated;
revoke all on function public.physical_economy_effect_kind_v1(text) from public, anon, authenticated;
revoke all on function public.import_physical_economy_pack_unchecked_v1(uuid,uuid,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.import_physical_economy_pack_v1(uuid,uuid,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.activate_physical_economy_pack_v1(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.read_player_crafting_v1(uuid,uuid) from public, anon, authenticated;
revoke all on function public.start_player_crafting_job_v1(uuid,uuid,text,integer,jsonb,text) from public, anon, authenticated;
revoke all on function public.cancel_player_crafting_job_v1(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.claim_player_crafting_job_v1(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.set_player_equipment_slot_v1(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.use_player_inventory_item_effect_v1(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.salvage_player_equipment_v1(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.read_admin_crafting_oversight_v1(uuid,uuid,text,integer) from public, anon, authenticated;
revoke all on function public.recover_admin_crafting_job_v1(uuid,uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.apply_admin_physical_economy_supply_v1(uuid,uuid,text,text,text,integer,numeric,numeric,text,timestamptz,text) from public, anon, authenticated;
