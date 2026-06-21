-- Tighten country difficulty policy guardrails V1.
-- This migration keeps custom difficulty as an inferred per-game Advanced Settings state,
-- not a selectable global preset, and strengthens audit scope constraints.

-- The earlier foundation migration temporarily seeded a custom global profile while the model was evolving.
-- Remove it before enforcing selectable-preset constraints.
delete from public.difficulty_policy_profiles
where preset_key = 'custom';

alter table public.difficulty_policy_profiles
  add constraint difficulty_policy_profiles_no_custom_preset_v2
  check (preset_key <> 'custom');

alter table public.difficulty_policy_profiles
  add constraint difficulty_policy_profiles_id_preset_key_unique
  unique (id, preset_key);

alter table public.game_difficulty_policy_settings
  add constraint game_difficulty_policy_settings_profile_preset_fk
  foreign key (difficulty_policy_profile_id, difficulty_preset)
  references public.difficulty_policy_profiles (id, preset_key);

alter table public.country_economic_snapshots
  add constraint country_economic_snapshots_profile_preset_fk
  foreign key (difficulty_policy_profile_id, difficulty_preset)
  references public.difficulty_policy_profiles (id, preset_key);

alter table public.country_economic_snapshots
  add constraint country_economic_snapshots_difficulty_profile_consistency
  check (
    (
      difficulty_preset = 'custom'
      and difficulty_policy_profile_id is null
    )
    or (
      difficulty_preset <> 'custom'
      and difficulty_policy_profile_id is not null
    )
  );

alter table public.player_country_migration_events
  add constraint player_country_migration_events_from_assignment_pair
  check (
    (
      from_assignment_id is null
      and from_country_profile_id is null
    )
    or (
      from_assignment_id is not null
      and from_country_profile_id is not null
    )
  );

create or replace function public.initialize_country_economic_snapshots_for_game(
  p_game_session_id uuid,
  p_simulation_tick integer default 0,
  p_snapshot_label text default 'Initial baseline',
  p_request_metadata jsonb default '{}'::jsonb
)
returns table (
  country_profile_id uuid,
  snapshot_id uuid,
  simulation_tick integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_difficulty_preset text;
  v_policy_profile_id uuid;
  v_difficulty_preset text;
  v_price_modifier numeric(9, 4);
  v_event_volatility_modifier numeric(9, 4);
  v_scarcity_modifier numeric(9, 4);
  v_income_modifier numeric(9, 4);
  v_trade_modifier numeric(9, 4);
  v_credit_modifier numeric(9, 4);
begin
  if p_game_session_id is null then
    raise exception 'p_game_session_id is required'
      using errcode = '22023';
  end if;

  if p_simulation_tick is null or p_simulation_tick < 0 then
    raise exception 'p_simulation_tick must be non-negative'
      using errcode = '22023';
  end if;

  if p_snapshot_label is not null and length(btrim(p_snapshot_label)) = 0 then
    raise exception 'p_snapshot_label must not be blank'
      using errcode = '22023';
  end if;

  if p_request_metadata is null or jsonb_typeof(p_request_metadata) <> 'object' then
    raise exception 'p_request_metadata must be a JSON object'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.game_sessions gs
    where gs.id = p_game_session_id
  ) then
    raise exception 'game session not found'
      using errcode = 'P0002';
  end if;

  select
    gdps.difficulty_policy_profile_id,
    gdps.difficulty_preset,
    gdps.price_modifier,
    gdps.event_volatility_modifier,
    gdps.scarcity_modifier,
    gdps.income_modifier,
    gdps.trade_modifier,
    gdps.credit_modifier
  into
    v_policy_profile_id,
    v_difficulty_preset,
    v_price_modifier,
    v_event_volatility_modifier,
    v_scarcity_modifier,
    v_income_modifier,
    v_trade_modifier,
    v_credit_modifier
  from public.game_difficulty_policy_settings gdps
  where gdps.game_session_id = p_game_session_id
    and gdps.status = 'active';

  if v_difficulty_preset is null then
    select coalesce(gs.difficulty_preset, 'standard')
    into v_game_difficulty_preset
    from public.game_settings gs
    where gs.game_session_id = p_game_session_id;

    if lower(coalesce(v_game_difficulty_preset, 'standard')) = 'custom' then
      raise exception 'custom difficulty settings must be configured before initializing country economic snapshots'
        using errcode = '22023';
    end if;

    select
      dpp.id,
      dpp.preset_key,
      dpp.price_modifier,
      dpp.event_volatility_modifier,
      dpp.scarcity_modifier,
      dpp.income_modifier,
      dpp.trade_modifier,
      dpp.credit_modifier
    into
      v_policy_profile_id,
      v_difficulty_preset,
      v_price_modifier,
      v_event_volatility_modifier,
      v_scarcity_modifier,
      v_income_modifier,
      v_trade_modifier,
      v_credit_modifier
    from public.difficulty_policy_profiles dpp
    where dpp.preset_key = lower(coalesce(v_game_difficulty_preset, 'standard'))
      and dpp.status = 'active';
  end if;

  if v_difficulty_preset is null then
    select
      dpp.id,
      dpp.preset_key,
      dpp.price_modifier,
      dpp.event_volatility_modifier,
      dpp.scarcity_modifier,
      dpp.income_modifier,
      dpp.trade_modifier,
      dpp.credit_modifier
    into
      v_policy_profile_id,
      v_difficulty_preset,
      v_price_modifier,
      v_event_volatility_modifier,
      v_scarcity_modifier,
      v_income_modifier,
      v_trade_modifier,
      v_credit_modifier
    from public.difficulty_policy_profiles dpp
    where dpp.preset_key = 'standard'
      and dpp.status = 'active';
  end if;

  if v_difficulty_preset is null then
    raise exception 'active difficulty policy not found'
      using errcode = 'P0002';
  end if;

  return query
  insert into public.country_economic_snapshots (
    game_session_id,
    country_profile_id,
    simulation_tick,
    snapshot_label,
    difficulty_policy_profile_id,
    difficulty_preset,
    price_difficulty_modifier,
    event_volatility_modifier,
    scarcity_difficulty_modifier,
    income_difficulty_modifier,
    trade_difficulty_modifier,
    credit_difficulty_modifier,
    metadata
  )
  select
    p_game_session_id,
    cp.id,
    p_simulation_tick,
    p_snapshot_label,
    v_policy_profile_id,
    v_difficulty_preset,
    v_price_modifier,
    v_event_volatility_modifier,
    v_scarcity_modifier,
    v_income_modifier,
    v_trade_modifier,
    v_credit_modifier,
    p_request_metadata || jsonb_build_object(
      'initializationSource', 'initialize_country_economic_snapshots_for_game',
      'difficultyPreset', v_difficulty_preset
    )
  from public.country_profiles cp
  where cp.status = 'active'
  on conflict (game_session_id, country_profile_id, simulation_tick) do update
    set metadata = public.country_economic_snapshots.metadata || excluded.metadata
  returning
    public.country_economic_snapshots.country_profile_id,
    public.country_economic_snapshots.id,
    public.country_economic_snapshots.simulation_tick;
end;
$$;

comment on function public.initialize_country_economic_snapshots_for_game(uuid, integer, text, jsonb) is
  'Creates baseline country_economic_snapshots for every active map country in one game session. It resolves difficulty from game_difficulty_policy_settings first, then game_settings/difficulty_policy_profiles, snapshots those modifiers, rejects unconfigured custom difficulty, and is safe to call repeatedly for the same game/tick.';
