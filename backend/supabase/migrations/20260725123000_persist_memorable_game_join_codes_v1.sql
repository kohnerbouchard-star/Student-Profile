begin;

-- A Game Code is a public multiplayer room identifier, not a Player credential.
-- Persist the readable value so staff can retrieve and share it after reloads.
-- Player authentication still requires the separate Player ID and Access Code.
alter table public.game_sessions
  add column if not exists game_join_code text null;

alter table public.game_sessions
  drop constraint if exists game_sessions_readable_join_code_valid;
alter table public.game_sessions
  add constraint game_sessions_readable_join_code_valid check (
    game_join_code is null
    or game_join_code ~ '^ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}$'
  );

create unique index if not exists game_sessions_active_readable_join_code_unique
  on public.game_sessions (game_join_code)
  where game_join_code is not null and game_join_code_status = 'active';

comment on column public.game_sessions.game_join_code is
  'Current readable multiplayer Game Code. This is a public room identifier and is persisted for staff display; Player ID and Player Access Code remain the authentication credentials.';

create or replace function public.issue_game_join_code_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid
)
returns table (
  game_join_code text,
  game_join_code_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_adjectives constant text[] := array[
    'AMBER', 'BRIGHT', 'CALM', 'CORAL', 'COSMIC', 'CRIMSON', 'DAWN', 'EMBER',
    'GOLDEN', 'LUNAR', 'NEON', 'NOVA', 'RAPID', 'SILVER', 'SOLAR', 'STEADY',
    'AURORA', 'BOLD', 'CLEAR', 'FROST', 'GLASS', 'IRON', 'JADE', 'LIGHT',
    'MIST', 'QUIET', 'RUBY', 'SABLE', 'SWIFT', 'VIVID', 'WARM', 'WILD'
  ];
  v_nouns constant text[] := array[
    'ANCHOR', 'BEACON', 'BRIDGE', 'COMET', 'FALCON', 'FORGE', 'HARBOR', 'HORIZON',
    'MAPLE', 'ORBIT', 'PHOENIX', 'RIVER', 'ROCKET', 'SUMMIT', 'TIGER', 'VECTOR',
    'ARROW', 'CASTLE', 'CIPHER', 'DRAGON', 'GARDEN', 'ISLAND', 'LANTERN', 'MARKET',
    'MEADOW', 'PORTAL', 'SPARK', 'TEMPLE', 'TOWER', 'TRAIL', 'WAVE', 'WOLF'
  ];
  v_random bytea;
  v_code text;
  v_hash text;
  v_updated_at timestamptz;
  v_attempt integer;
begin
  if not public.seed_content_request_is_privileged_v1() then
    raise exception 'GAME_JOIN_CODE_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_game_session_id is null or p_staff_user_id is null then
    raise exception 'GAME_JOIN_CODE_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.owner_staff_user_id = p_staff_user_id
      and coalesce(game_row.lifecycle_state, 'active') not in ('ended', 'archived')
  ) then
    raise exception 'GAME_JOIN_CODE_GAME_UNAVAILABLE' using errcode = 'P0001';
  end if;

  for v_attempt in 1..20 loop
    v_random := extensions.gen_random_bytes(4);
    v_code := format(
      'ECO-%s-%s-%s',
      v_adjectives[1 + (get_byte(v_random, 0) % array_length(v_adjectives, 1))],
      v_nouns[1 + (get_byte(v_random, 1) % array_length(v_nouns, 1))],
      lpad((((get_byte(v_random, 2) * 256) + get_byte(v_random, 3)) % 1000)::text, 3, '0')
    );
    v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');

    begin
      update public.game_sessions as game_row
      set game_join_code = v_code,
          game_join_code_hash = v_hash,
          game_join_code_status = 'active',
          updated_at = now()
      where game_row.id = p_game_session_id
        and game_row.owner_staff_user_id = p_staff_user_id
      returning game_row.updated_at into v_updated_at;

      if found then
        return query select v_code, 'active'::text, v_updated_at;
        return;
      end if;
    exception when unique_violation then
      -- Generate another readable code if an active game already owns this one.
      null;
    end;
  end loop;

  raise exception 'GAME_JOIN_CODE_GENERATION_CONFLICT' using errcode = '23505';
end;
$function$;

revoke all on function public.issue_game_join_code_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.issue_game_join_code_v1(uuid, uuid)
  to service_role;

comment on function public.issue_game_join_code_v1(uuid, uuid) is
  'Issues or rotates one memorable persisted Game Code for an owned non-ended game, updating the readable identifier and compatibility hash atomically. Service-role only.';

-- V2 is the canonical game-creation entrypoint. V1 still performs the bounded
-- content clone; V2 replaces its temporary random code with the memorable,
-- persisted code from the single database-owned issuance authority.
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
  v_join_code text;
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

  -- Replays return the persisted current code instead of requiring rotation.
  if coalesce(v_result->>'outcome', '') = 'replayed' then
    select game_row.game_join_code
    into v_join_code
    from public.game_sessions as game_row
    where game_row.id = v_game_id
      and game_row.owner_staff_user_id = p_staff_user_id;

    if v_join_code is null then
      select issued.game_join_code
      into v_join_code
      from public.issue_game_join_code_v1(v_game_id, p_staff_user_id) as issued;
    end if;

    return v_result || jsonb_build_object(
      'joinCode', v_join_code,
      'joinCodeStatus', 'active',
      'joinCodeReissueRequired', false
    );
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
    and source_pack.game_session_id <> v_game_id
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

  select issued.game_join_code
  into v_join_code
  from public.issue_game_join_code_v1(v_game_id, p_staff_user_id) as issued;

  if v_join_code is null then
    raise exception 'GAME_PROVISIONING_JOIN_CODE_MISSING' using errcode = 'P0001';
  end if;

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
      'activationVersion', 'full-game-feature-activation-v2',
      'joinCode', v_join_code,
      'joinCodeStatus', 'active',
      'joinCodeReissueRequired', false
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
      'featureActivation', v_activation,
      'joinCodeStatus', 'active'
    )
  where game_session_id = v_game_id
    and action = 'game.provisioned'
    and target_id = v_game_id;

  return v_result;
end;
$function$;

revoke all on function public.create_provisioned_game_v2(
  uuid, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.create_provisioned_game_v2(
  uuid, text, jsonb, text, text
) to service_role;

comment on function public.create_provisioned_game_v2(
  uuid, text, jsonb, text, text
) is
  'Creates an isolated multiplayer game, completes approved feature activation, and atomically issues one memorable persisted Game Code that remains readable to the owning Admin until explicitly rotated.';

notify pgrst, 'reload schema';

commit;
