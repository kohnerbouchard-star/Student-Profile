-- Fail-closed PR #163 physical-economy activation.
-- Final controller-assigned Crafting migration identity.

create or replace function public.activate_physical_economy_pack_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_pack_key text,
  p_content_version text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_pack public.physical_economy_content_packs%rowtype;
  v_event public.physical_economy_admin_events%rowtype;
  v_pack_key text := lower(btrim(coalesce(p_pack_key,'')));
  v_content_version text := btrim(coalesce(p_content_version,''));
  v_now timestamptz := statement_timestamp();
begin
  if v_pack_key !~ '^[a-z0-9][a-z0-9._-]{2,127}$'
    or length(v_content_version) not between 1 and 64
    or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then
    raise exception 'PHYSICAL_ECONOMY_ACTIVATION_INVALID' using errcode='P0001';
  end if;

  if not exists (
    select 1 from public.game_sessions g
    where g.id=p_game_session_id and g.owner_staff_user_id=p_staff_user_id
  ) then
    raise exception 'PHYSICAL_ECONOMY_STAFF_SCOPE_INVALID' using errcode='P0001';
  end if;

  select * into v_event from public.physical_economy_admin_events
  where game_session_id=p_game_session_id and staff_user_id=p_staff_user_id
    and action='pack.activate' and idempotency_key=p_idempotency_key for update;
  if found then
    if v_event.target_key is distinct from v_pack_key
      or coalesce(v_event.outcome->>'contentVersion','') is distinct from v_content_version
    then
      raise exception 'PHYSICAL_ECONOMY_ACTIVATION_IDEMPOTENCY_CONFLICT' using errcode='P0001';
    end if;
    return v_event.outcome || jsonb_build_object('replayed',true);
  end if;

  if not exists (
    select 1 from public.game_sessions g
    where g.id=p_game_session_id and g.owner_staff_user_id=p_staff_user_id
      and g.status='active' and g.lifecycle_state='active'
  ) then
    raise exception 'PHYSICAL_ECONOMY_GAME_INACTIVE' using errcode='P0001';
  end if;

  select p.* into v_pack
  from public.physical_economy_content_packs p
  join public.game_session_physical_economy_packs gp on gp.pack_id=p.id
  where gp.game_session_id=p_game_session_id
    and p.pack_key=v_pack_key
    and p.content_version=v_content_version
  for update of p,gp;
  if not found then raise exception 'PHYSICAL_ECONOMY_PACK_NOT_FOUND' using errcode='P0001'; end if;

  if coalesce((v_pack.metadata #>> '{activationAuthorization,catalogAuthorized}')::boolean,false) is not true
    or coalesce((v_pack.metadata #>> '{activationAuthorization,recipeAuthorized}')::boolean,false) is not true
    or coalesce((v_pack.metadata #>> '{activationAuthorization,calibrationAuthorized}')::boolean,false) is not true
    or coalesce((v_pack.metadata #>> '{activationAuthorization,downstreamContractValidated}')::boolean,false) is not true
    or coalesce((v_pack.metadata #>> '{activationAuthorization,productionAuthorized}')::boolean,true) is not false
    or coalesce((v_pack.metadata #>> '{calibrationEvidence,balanceGateSummary,activationAuthorized}')::boolean,false) is not true
    or jsonb_array_length(coalesce(v_pack.metadata #> '{calibrationEvidence,balanceGateSummary,failures}','[]'::jsonb)) <> 0
  then
    raise exception 'PHYSICAL_ECONOMY_PACK_NOT_AUTHORIZED'
      using errcode='P0001',
      hint='PR #163 must authorize the exact catalog, recipes, calibration, digest, and downstream contract with zero failed gates.';
  end if;

  if not exists (
      select 1 from public.physical_economy_item_definitions i where i.pack_id=v_pack.id
    )
    or not exists (
      select 1 from public.physical_economy_recipe_definitions r where r.pack_id=v_pack.id
    )
    or exists (
      select 1 from public.physical_economy_item_definitions i
      where i.pack_id=v_pack.id and i.status in ('disabled','retired')
    )
    or exists (
      select 1 from public.physical_economy_recipe_definitions r
      where r.pack_id=v_pack.id and r.status in ('disabled','retired')
    )
    or exists (
      select 1
      from public.physical_economy_recipe_definitions r
      where r.pack_id=v_pack.id
        and (
          not exists (select 1 from public.physical_economy_recipe_inputs ri where ri.recipe_id=r.id)
          or not exists (select 1 from public.physical_economy_recipe_outputs ro where ro.recipe_id=r.id)
        )
    )
    or exists (
      select 1
      from public.physical_economy_recipe_inputs ri
      join public.physical_economy_recipe_definitions r on r.id=ri.recipe_id
      left join public.physical_economy_item_definitions i
        on i.pack_id=r.pack_id and i.item_key=ri.item_key
      where r.pack_id=v_pack.id
        and (i.id is null or i.status not in ('staged','active'))
    )
    or exists (
      select 1
      from public.physical_economy_recipe_outputs ro
      join public.physical_economy_recipe_definitions r on r.id=ro.recipe_id
      left join public.physical_economy_item_definitions i
        on i.pack_id=r.pack_id and i.item_key=ro.item_key
      where r.pack_id=v_pack.id
        and (
          i.id is null
          or i.status not in ('staged','active')
          or (ro.output_kind='equipment' and i.item_class<>'equipment')
          or (ro.output_kind='stackable' and not i.stackable)
        )
    )
    or exists (
      select 1
      from public.physical_economy_item_definitions i
      left join public.physical_economy_effect_definitions e
        on e.pack_id=i.pack_id and e.effect_code=i.effect_code
      where i.pack_id=v_pack.id and i.effect_enabled
        and (e.id is null or not e.enabled or e.effect_kind='disabled_repair')
    )
    or exists (
      select 1
      from public.physical_economy_substitution_options s
      left join public.physical_economy_item_definitions i
        on i.pack_id=s.pack_id and i.item_key=s.item_key
      where s.pack_id=v_pack.id and s.enabled
        and (i.id is null or i.status not in ('staged','active'))
    )
    or exists (
      select 1
      from public.physical_economy_salvage_rules sr
      left join public.physical_economy_item_definitions i
        on i.pack_id=sr.pack_id and i.item_key=sr.equipment_item_key
      where sr.pack_id=v_pack.id and sr.enabled
        and (i.id is null or i.status not in ('staged','active') or i.item_class<>'equipment')
    )
    or exists (
      select 1
      from public.physical_economy_salvage_rules sr
      cross join lateral jsonb_array_elements(sr.outputs) output
      left join public.physical_economy_item_definitions i
        on i.pack_id=sr.pack_id and i.item_key=lower(coalesce(output->>'itemKey',''))
      where sr.pack_id=v_pack.id and sr.enabled
        and (i.id is null or i.status not in ('staged','active'))
    )
    or exists (
      select 1
      from public.physical_economy_recipe_definitions r
      left join public.game_session_recipe_availability a
        on a.game_session_id=p_game_session_id and a.recipe_id=r.id
      where r.pack_id=v_pack.id and a.recipe_id is null
    )
  then
    raise exception 'PHYSICAL_ECONOMY_DEFINITION_CLOSURE_INVALID'
      using errcode='P0001',
      hint='Activation requires complete, non-retired PR #163 definitions with closed item, recipe, effect, substitution, salvage, and availability references.';
  end if;

  update public.game_session_physical_economy_packs
  set status='disabled'
  where game_session_id=p_game_session_id and status='active' and pack_id<>v_pack.id;

  update public.game_session_physical_economy_packs
  set status='active',activated_by_staff_user_id=p_staff_user_id,activated_at=v_now
  where game_session_id=p_game_session_id and pack_id=v_pack.id;

  update public.physical_economy_content_packs
  set status='active',activated_at=coalesce(activated_at,v_now)
  where id=v_pack.id;

  update public.physical_economy_item_definitions
  set status='active'
  where pack_id=v_pack.id and status='staged';

  update public.physical_economy_recipe_definitions
  set status='active'
  where pack_id=v_pack.id and status='staged';

  update public.game_session_recipe_availability a
  set enabled=(r.status='active'),updated_at=v_now,version=a.version+1
  from public.physical_economy_recipe_definitions r
  where a.game_session_id=p_game_session_id and a.recipe_id=r.id and r.pack_id=v_pack.id;

  insert into public.physical_economy_admin_events (
    game_session_id,staff_user_id,action,idempotency_key,target_key,outcome
  ) values (
    p_game_session_id,p_staff_user_id,'pack.activate',p_idempotency_key,v_pack.pack_key,
    jsonb_build_object(
      'packKey',v_pack.pack_key,'contentVersion',v_pack.content_version,'contentDigest',v_pack.content_digest,
      'status','active','durabilityEnabled',false,'repairEnabled',false,'replayed',false
    )
  ) returning * into v_event;

  insert into public.audit_log (
    game_session_id,actor_type,actor_id,action,target_type,target_id,metadata
  ) values (
    p_game_session_id,'staff_user',p_staff_user_id,'physical_economy.pack_activated',
    'physical_economy_content_pack',v_pack.id,v_event.outcome
  );

  return v_event.outcome;
end
$function$;
