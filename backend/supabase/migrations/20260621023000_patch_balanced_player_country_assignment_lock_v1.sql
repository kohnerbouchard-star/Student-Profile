-- Balanced player country assignment lock patch V1.
-- Replaces the player creation + country assignment RPC from
-- 20260621021000_add_balanced_player_country_assignment_v1.sql with the
-- same behavior plus a per-game advisory transaction lock.
--
-- This prevents concurrent player creation requests for the same game session
-- from reading the same country counts and clustering assignments.
-- No backfill is included because the current deployment has no existing players
-- requiring retroactive country assignment.

create or replace function public.create_player_with_balanced_country_assignment(
  p_game_session_id uuid,
  p_display_name text,
  p_roster_label text default null,
  p_assignment_metadata jsonb default '{}'::jsonb
)
returns table (
  player_id uuid,
  display_name text,
  roster_label text,
  player_status text,
  player_created_at timestamptz,
  player_updated_at timestamptz,
  country_assignment_id uuid,
  country_profile_id uuid,
  country_code text,
  country_name text,
  assigned_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_roster_label text := nullif(btrim(coalesce(p_roster_label, '')), '');
  v_player public.players%rowtype;
  v_country public.country_profiles%rowtype;
  v_assignment public.player_country_assignments%rowtype;
  v_snapshot_count integer := 0;
begin
  if p_game_session_id is null then
    raise exception 'GAME_SESSION_REQUIRED'
      using errcode = 'P0001';
  end if;

  -- Serialize player creation + country selection per game session.
  -- This keeps the weighted distribution meaningful under simultaneous admin actions.
  perform pg_advisory_xact_lock(hashtext(p_game_session_id::text));

  if length(v_display_name) = 0 then
    raise exception 'PLAYER_DISPLAY_NAME_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_assignment_metadata is null or jsonb_typeof(p_assignment_metadata) <> 'object' then
    raise exception 'INVALID_ASSIGNMENT_METADATA'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions gs
    where gs.id = p_game_session_id
      and gs.status = 'active'
  ) then
    raise exception 'GAME_SESSION_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  select count(*)
  into v_snapshot_count
  from public.country_economic_snapshots ces
  where ces.game_session_id = p_game_session_id
    and ces.snapshot_sequence = 0;

  if v_snapshot_count = 0 then
    perform 1
    from public.initialize_country_economic_snapshots_for_game(
      p_game_session_id,
      now(),
      'Initial baseline',
      jsonb_build_object(
        'initializationSource', 'create_player_with_balanced_country_assignment',
        'reason', 'first_player_country_assignment'
      ) || p_assignment_metadata
    );
  end if;

  insert into public.players (
    game_session_id,
    display_name,
    roster_label,
    status
  )
  values (
    p_game_session_id,
    v_display_name,
    v_roster_label,
    'active'
  )
  returning *
  into v_player;

  with country_assignment_counts as (
    select
      cp.id as country_profile_id,
      cp.country_code,
      cp.country_name,
      count(pca.id)::integer as active_assignment_count
    from public.country_profiles cp
    left join public.player_country_assignments pca
      on pca.country_profile_id = cp.id
      and pca.game_session_id = p_game_session_id
      and pca.status = 'active'
    where cp.status = 'active'
      and exists (
        select 1
        from public.country_economic_snapshots ces
        where ces.game_session_id = p_game_session_id
          and ces.country_profile_id = cp.id
      )
    group by cp.id, cp.country_code, cp.country_name
  ),
  max_count as (
    select coalesce(max(active_assignment_count), 0) as max_assignment_count
    from country_assignment_counts
  ),
  weighted_countries as (
    select
      cac.country_profile_id,
      cac.country_code,
      cac.country_name,
      power(((mc.max_assignment_count - cac.active_assignment_count) + 1)::numeric, 2) as assignment_weight,
      random() as tie_breaker
    from country_assignment_counts cac
    cross join max_count mc
  ),
  threshold as (
    select random() * sum(assignment_weight) as selection_point
    from weighted_countries
  ),
  running_weights as (
    select
      wc.country_profile_id,
      wc.country_code,
      wc.country_name,
      sum(wc.assignment_weight) over (
        order by wc.tie_breaker, wc.country_profile_id
      ) as cumulative_weight
    from weighted_countries wc
  )
  select
    cp.*
  into v_country
  from running_weights rw
  join threshold t on true
  join public.country_profiles cp on cp.id = rw.country_profile_id
  where rw.cumulative_weight >= t.selection_point
  order by rw.cumulative_weight
  limit 1;

  if not found then
    raise exception 'COUNTRY_ASSIGNMENT_COUNTRY_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  insert into public.player_country_assignments (
    game_session_id,
    player_id,
    country_profile_id,
    status,
    assignment_reason,
    assigned_at
  )
  values (
    p_game_session_id,
    v_player.id,
    v_country.id,
    'active',
    'initial_balanced_random_assignment',
    now()
  )
  returning *
  into v_assignment;

  insert into public.player_country_migration_events (
    game_session_id,
    player_id,
    from_country_profile_id,
    to_country_profile_id,
    from_assignment_id,
    to_assignment_id,
    migration_reason,
    metadata,
    migrated_at
  )
  values (
    p_game_session_id,
    v_player.id,
    null,
    v_country.id,
    null,
    v_assignment.id,
    'initial_balanced_random_assignment',
    jsonb_build_object(
      'assignmentAlgorithm', 'weighted_random_balance_v1',
      'assignmentWeightFormula', '(maxActiveAssignments - activeAssignments + 1)^2',
      'lockScope', 'game_session',
      'lockFunction', 'pg_advisory_xact_lock(hashtext(game_session_id))'
    ) || p_assignment_metadata,
    v_assignment.assigned_at
  );

  return query
  select
    v_player.id,
    v_player.display_name,
    v_player.roster_label,
    v_player.status,
    v_player.created_at,
    v_player.updated_at,
    v_assignment.id,
    v_country.id,
    v_country.country_code,
    v_country.country_name,
    v_assignment.assigned_at;
end;
$$;

comment on function public.create_player_with_balanced_country_assignment(
  uuid,
  text,
  text,
  jsonb
) is
  'Creates an active player and assigns an active country in one transaction. Selection uses a per-game advisory transaction lock and weighted random balancing with (maxActiveAssignments - activeAssignments + 1)^2 so simultaneous player creation cannot reuse stale assignment counts.';

revoke all on function public.create_player_with_balanced_country_assignment(
  uuid,
  text,
  text,
  jsonb
) from public;

grant execute on function public.create_player_with_balanced_country_assignment(
  uuid,
  text,
  text,
  jsonb
) to service_role;
