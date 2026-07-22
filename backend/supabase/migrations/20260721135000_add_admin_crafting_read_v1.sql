-- Admin crafting oversight, recovery, supply controls, and function grants.
-- Final controller-assigned Crafting migration identity.

create or replace function public.read_admin_crafting_oversight_v1(
  p_game_session_id uuid,p_staff_user_id uuid,p_status text default null,p_limit integer default 100
)
returns jsonb
language plpgsql security definer stable
set search_path=public,pg_temp
as $function$
declare
  v_pack jsonb;
  v_jobs jsonb;
  v_effects jsonb;
  v_supply jsonb;
  v_invariants jsonb;
begin
  if not exists (select 1 from public.game_sessions where id=p_game_session_id and owner_staff_user_id=p_staff_user_id)
  then raise exception 'CRAFTING_ADMIN_SCOPE_INVALID' using errcode='P0001'; end if;
  select jsonb_build_object(
    'packKey',p.pack_key,'contentVersion',p.content_version,'contentDigest',p.content_digest,
    'sourceCommit',p.source_commit,'status',gp.status,'activatedAt',gp.activated_at,
    'durabilityEnabled',false,'repairEnabled',false
  ) into v_pack
  from public.game_session_physical_economy_packs gp
  join public.physical_economy_content_packs p on p.id=gp.pack_id
  where gp.game_session_id=p_game_session_id order by gp.imported_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'jobKey',j.public_id,'playerId',coalesce(pl.player_identifier,pl.roster_label,pl.display_name),
    'recipeKey',j.recipe_key,'recipeName',r.name,'quantity',j.quantity,'status',j.status,
    'difficulty',j.difficulty_key,'countryCode',j.country_code,'qualityBand',j.quality_band,
    'startedAt',j.started_at,'completesAt',j.completes_at,'claimedAt',j.claimed_at,
    'failureCode',j.failure_code,'recoveryVersion',j.recovery_version
  ) order by j.created_at desc),'[]'::jsonb) into v_jobs
  from (select * from public.crafting_jobs
        where game_session_id=p_game_session_id and (p_status is null or status=lower(p_status))
        order by created_at desc limit greatest(1,least(coalesce(p_limit,100),500))) j
  join public.players pl on pl.id=j.player_id
  join public.physical_economy_recipe_definitions r on r.id=j.recipe_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'effectCode',d.effect_code,'handlerCode',d.handler_code,'kind',d.effect_kind,'scope',d.scope,
    'durationSeconds',d.duration_seconds,'stackingRule',d.stacking_rule,'maxStacks',d.max_stacks,
    'cooldownSeconds',d.cooldown_seconds,'enabled',d.enabled,'summary',d.public_summary
  ) order by d.effect_code),'[]'::jsonb) into v_effects
  from public.physical_economy_effect_definitions d
  join public.game_session_physical_economy_packs gp on gp.pack_id=d.pack_id
  where gp.game_session_id=p_game_session_id and gp.status='active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'itemKey',s.item_key,'countryCode',s.country_code,'scarcityBand',s.scarcity_band,
    'availableQuantity',s.available_quantity,'reservedQuantity',s.reserved_quantity,
    'eventMultiplier',s.event_multiplier,'routeMultiplier',s.route_multiplier,
    'sourceEventKey',s.source_event_key,'expiresAt',s.expires_at,'version',s.version
  ) order by s.item_key,s.country_code),'[]'::jsonb) into v_supply
  from public.game_session_item_supply s where s.game_session_id=p_game_session_id;

  select jsonb_build_object(
    'negativeOwned',(select count(*) from public.inventory_holdings where game_session_id=p_game_session_id and quantity_owned<0),
    'negativeReserved',(select count(*) from public.inventory_holdings where game_session_id=p_game_session_id and quantity_reserved<0),
    'reservedAboveOwned',(select count(*) from public.inventory_holdings where game_session_id=p_game_session_id and quantity_reserved>quantity_owned),
    'reservationProjectionMismatch',(
      select count(*) from public.inventory_holdings h where h.game_session_id=p_game_session_id
      and h.quantity_reserved<>coalesce((select sum(r.quantity) from public.inventory_reservations r
        where r.inventory_holding_id=h.id and r.status='active'),0)
    ),
    'duplicateOutputGrants',(
      select count(*) from (select job_id,line_key from public.crafting_job_outputs
        where granted_at is not null group by job_id,line_key having count(*)>1) x
    ),
    'repairEnabled',false,'durabilityEnabled',false
  ) into v_invariants;

  return jsonb_build_object('schemaVersion',1,'pack',coalesce(v_pack,'{}'::jsonb),
    'jobs',v_jobs,'effects',v_effects,'supply',v_supply,'invariants',v_invariants);
end
$function$;
