begin;

-- V1 canonical game provisioning intentionally selects the newest complete Seed/World
-- source. A newer provisioned game can satisfy that contract without carrying the
-- separately authorized physical-economy pack. V2 therefore resolves its Crafting
-- activation source independently, while leaving V1 Seed/World source semantics
-- unchanged.
create or replace function public.create_provisioned_game_v2(
  p_staff_user_id uuid,
  p_game_name text,
  p_game_settings jsonb,
  p_idempotency_key text,
  p_pack_id text default 'econovaria.beta-seed-pack.v1'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
  v_game_id uuid;
  v_seed_source_game_id uuid;
  v_crafting_source_game_id uuid;
  v_activation jsonb;
  v_counts jsonb;
begin
  v_result := public.create_provisioned_game_v1(
    p_staff_user_id,
    p_game_name,
    p_game_settings,
    p_idempotency_key,
    p_pack_id
  );

  if coalesce(v_result->>'outcome', '') in ('failed', 'failed_replay') then
    return v_result;
  end if;

  v_game_id := nullif(v_result->>'gameSessionId', '')::uuid;

  if v_game_id is null then
    raise exception 'FULL_GAME_ACTIVATION_GAME_ID_MISSING' using errcode = 'P0001';
  end if;

  select game_row.provisioning_source_game_session_id
  into v_seed_source_game_id
  from public.game_sessions as game_row
  where game_row.id = v_game_id
    and game_row.owner_staff_user_id = p_staff_user_id;

  if v_seed_source_game_id is null then
    raise exception 'FULL_GAME_ACTIVATION_SOURCE_MISSING' using errcode = 'P0001';
  end if;

  select source_pack.game_session_id
  into v_crafting_source_game_id
  from public.game_session_physical_economy_packs as source_pack
  join public.physical_economy_content_packs as pack_row
    on pack_row.id = source_pack.pack_id
  where source_pack.status = 'active'
    and pack_row.status = 'active'
    and pack_row.pack_key = btrim(p_pack_id)
    and coalesce(
      (pack_row.metadata #>> '{activationAuthorization,productionAuthorized}')::boolean,
      false
    ) = false
  order by
    case when source_pack.game_session_id = v_seed_source_game_id then 0 else 1 end,
    source_pack.activated_at desc nulls last,
    source_pack.imported_at desc,
    source_pack.game_session_id
  limit 1;

  -- Preserve the existing fail-closed response contract when no authorized active
  -- Crafting source exists. complete_game_feature_activation_v2 will report the
  -- Crafting gate as blocked rather than bypassing its authority checks.
  v_crafting_source_game_id := coalesce(
    v_crafting_source_game_id,
    v_seed_source_game_id
  );

  v_activation := public.complete_game_feature_activation_v2(
    v_game_id,
    v_crafting_source_game_id,
    p_staff_user_id,
    now()
  );

  v_counts := coalesce(v_result->'counts', '{}'::jsonb)
    || coalesce(v_activation->'counts', '{}'::jsonb);

  v_result := v_result
    || jsonb_build_object(
      'counts', v_counts,
      'contentGates', jsonb_build_object(
        'crafting', v_activation->>'crafting',
        'story', v_activation->>'story',
        'arrivalGrantProcessor', v_activation->>'arrivalGrantProcessor',
        'progressionInitialization', v_activation->>'progressionInitialization'
      ),
      'activationVersion', 'full-game-feature-activation-v2'
    );

  update public.game_creation_provisioning_requests
  set result = v_result
  where staff_user_id = p_staff_user_id
    and idempotency_key = p_idempotency_key
    and game_session_id = v_game_id
    and status = 'completed';

  update public.audit_log
  set metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'activationVersion', 'full-game-feature-activation-v2',
      'featureActivation', v_activation
    )
  where game_session_id = v_game_id
    and action = 'game.provisioned'
    and target_id = v_game_id;

  return v_result;
end;
$function$;

comment on function public.create_provisioned_game_v2(
  uuid, text, jsonb, text, text
) is
  'Creates an isolated multiplayer game through V1, resolves the active non-production Crafting source independently from the canonical Seed/World source, and completes full-game feature activation before returning.';

revoke all on function public.create_provisioned_game_v2(
  uuid, text, jsonb, text, text
) from public, anon, authenticated;

grant execute on function public.create_provisioned_game_v2(
  uuid, text, jsonb, text, text
) to service_role;

commit;
