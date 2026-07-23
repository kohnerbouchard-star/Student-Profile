begin;

create table public.progression_skill_definitions (
  public_skill_id text primary key,
  track text not null,
  tier integer not null,
  name text not null,
  description text not null,
  cost integer not null,
  minimum_level integer not null,
  prerequisite_skill_id text null references public.progression_skill_definitions(public_skill_id) on delete restrict,
  access_capability text not null,
  effect_basis_points integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint progression_skill_id_format check (public_skill_id ~ '^skl_[a-z0-9_]{3,64}_v1$'),
  constraint progression_skill_track_valid check (track in ('markets','enterprise','production','diplomacy')),
  constraint progression_skill_tier_valid check (tier between 1 and 3),
  constraint progression_skill_name_valid check (length(btrim(name)) between 1 and 80),
  constraint progression_skill_description_valid check (length(btrim(description)) between 1 and 400),
  constraint progression_skill_cost_valid check (cost between 1 and 3),
  constraint progression_skill_level_valid check (minimum_level between 1 and 20),
  constraint progression_skill_capability_valid check (access_capability ~ '^progression\.[a-z0-9_.-]{3,80}$'),
  constraint progression_skill_effect_valid check (effect_basis_points between 0 and 250),
  constraint progression_skill_track_tier_unique unique (track, tier)
);

insert into public.progression_skill_definitions (
  public_skill_id, track, tier, name, description, cost, minimum_level,
  prerequisite_skill_id, access_capability, effect_basis_points
) values
  ('skl_market_literacy_v1','markets',1,'Market Literacy','Improves access to market-learning tools without changing prices or guaranteed returns.',1,2,null,'progression.markets.literacy',100),
  ('skl_risk_discipline_v1','markets',2,'Risk Discipline','Unlocks advanced risk explanations and order-review prompts.',2,6,'skl_market_literacy_v1','progression.markets.risk',150),
  ('skl_portfolio_strategy_v1','markets',3,'Portfolio Strategy','Unlocks portfolio-planning guidance. It never guarantees performance.',3,10,'skl_risk_discipline_v1','progression.markets.strategy',250),
  ('skl_enterprise_basics_v1','enterprise',1,'Enterprise Basics','Unlocks business-planning guidance and operational checklists.',1,2,null,'progression.enterprise.basics',100),
  ('skl_operating_systems_v1','enterprise',2,'Operating Systems','Unlocks deeper production and staffing analysis.',2,6,'skl_enterprise_basics_v1','progression.enterprise.operations',150),
  ('skl_enterprise_strategy_v1','enterprise',3,'Enterprise Strategy','Unlocks strategic planning views without direct economic multipliers.',3,10,'skl_operating_systems_v1','progression.enterprise.strategy',250),
  ('skl_workshop_basics_v1','production',1,'Workshop Basics','Unlocks crafting guidance and material-planning explanations.',1,2,null,'progression.production.basics',100),
  ('skl_quality_control_v1','production',2,'Quality Control','Unlocks advanced quality and failure-risk explanations.',2,6,'skl_workshop_basics_v1','progression.production.quality',150),
  ('skl_production_mastery_v1','production',3,'Production Mastery','Unlocks production-planning tools without bypassing material costs.',3,10,'skl_quality_control_v1','progression.production.mastery',250),
  ('skl_civic_literacy_v1','diplomacy',1,'Civic Literacy','Unlocks country-policy and reputation explanations.',1,2,null,'progression.diplomacy.civic',100),
  ('skl_relationship_building_v1','diplomacy',2,'Relationship Building','Unlocks relationship-history and recovery guidance.',2,6,'skl_civic_literacy_v1','progression.diplomacy.relationships',150),
  ('skl_diplomatic_strategy_v1','diplomacy',3,'Diplomatic Strategy','Unlocks advanced reputation-planning tools without immunity from losses.',3,10,'skl_relationship_building_v1','progression.diplomacy.strategy',250);

create table public.progression_achievement_definitions (
  public_achievement_id text primary key,
  criterion_key text not null,
  threshold integer not null,
  name text not null,
  description text not null,
  reward_skill_points integer not null default 0,
  reward_reputation_type text null,
  reward_reputation_scope text null,
  reward_reputation_delta integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint progression_achievement_id_format check (public_achievement_id ~ '^ach_[a-z0-9_]{3,64}_v1$'),
  constraint progression_achievement_criterion_valid check (criterion_key ~ '^[a-z][a-z0-9_.-]{2,80}$'),
  constraint progression_achievement_threshold_valid check (threshold between 1 and 100000),
  constraint progression_achievement_name_valid check (length(btrim(name)) between 1 and 100),
  constraint progression_achievement_description_valid check (length(btrim(description)) between 1 and 500),
  constraint progression_achievement_skill_reward_valid check (reward_skill_points between 0 and 2),
  constraint progression_achievement_rep_type_valid check (reward_reputation_type is null or reward_reputation_type in ('country','career','story','relationship')),
  constraint progression_achievement_rep_scope_valid check (
    (reward_reputation_type is null and reward_reputation_scope is null and reward_reputation_delta = 0)
    or (reward_reputation_type is not null and reward_reputation_scope is not null and length(btrim(reward_reputation_scope)) between 1 and 80 and reward_reputation_delta between 1 and 20)
  )
);

insert into public.progression_achievement_definitions (
  public_achievement_id, criterion_key, threshold, name, description,
  reward_skill_points, reward_reputation_type, reward_reputation_scope, reward_reputation_delta
) values
  ('ach_first_step_v1','events.total',1,'First Step','Complete the first recognized progression event.',1,null,null,0),
  ('ach_consistent_growth_v1','events.total',25,'Consistent Growth','Complete twenty-five recognized progression events.',1,null,null,0),
  ('ach_long_horizon_v1','events.total',100,'Long Horizon','Complete one hundred recognized progression events.',2,null,null,0),
  ('ach_contract_professional_v1','contracts.completed',5,'Contract Professional','Complete five Contracts.',1,'career','general',5),
  ('ach_enterprise_operator_v1','business.operations',5,'Enterprise Operator','Complete five recognized business operations.',1,'career','general',5),
  ('ach_workshop_regular_v1','crafting.completed',5,'Workshop Regular','Complete five recognized crafting operations.',1,'career','general',5),
  ('ach_market_participant_v1','market.settled',10,'Market Participant','Complete ten settled market orders.',1,'country','assigned',4),
  ('ach_story_pathfinder_v1','story.completed',3,'Story Pathfinder','Complete three recognized story chapters.',1,'story','campaign',6),
  ('ach_reputation_recovery_v1','reputation.recovered',1,'Reputation Recovery','Recover any reputation score from negative to non-negative.',1,null,null,0),
  ('ach_skilled_generalist_v1','skills.unlocked',4,'Skilled Generalist','Unlock four skills.',1,null,null,0),
  ('ach_balanced_specialist_v1','specialization.tracks',3,'Balanced Specialist','Unlock at least one skill in three different tracks.',2,null,null,0),
  ('ach_level_ten_v1','level.current',10,'Established Professional','Reach level ten.',2,'career','general',10);

create table public.player_progression_profiles (
  game_session_id uuid not null,
  player_id uuid not null,
  experience bigint not null default 0,
  level integer not null default 1,
  earned_skill_points integer not null default 0,
  spent_skill_points integer not null default 0,
  bonus_skill_points integer not null default 0,
  public_title text not null default 'New Arrival',
  public_summary text not null default 'Building a balanced economic path.',
  country_reputation_public boolean not null default true,
  career_reputation_public boolean not null default true,
  story_reputation_public boolean not null default false,
  relationship_reputation_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_session_id, player_id),
  constraint player_progression_player_scope_fk foreign key (game_session_id, player_id)
    references public.players(game_session_id, id) on delete cascade,
  constraint player_progression_experience_valid check (experience between 0 and 1000000000),
  constraint player_progression_level_valid check (level between 1 and 20),
  constraint player_progression_points_valid check (
    earned_skill_points between 0 and 100
    and spent_skill_points between 0 and 100
    and bonus_skill_points between 0 and 100
    and spent_skill_points <= earned_skill_points + bonus_skill_points
  ),
  constraint player_progression_title_valid check (length(btrim(public_title)) between 1 and 80),
  constraint player_progression_summary_valid check (length(btrim(public_summary)) between 1 and 240)
);

create table public.player_reputation_scores (
  game_session_id uuid not null,
  player_id uuid not null,
  reputation_type text not null,
  scope_key text not null,
  score integer not null default 0,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_session_id, player_id, reputation_type, scope_key),
  constraint player_reputation_profile_fk foreign key (game_session_id, player_id)
    references public.player_progression_profiles(game_session_id, player_id) on delete cascade,
  constraint player_reputation_type_valid check (reputation_type in ('country','career','story','relationship')),
  constraint player_reputation_scope_valid check (scope_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'),
  constraint player_reputation_score_valid check (score between -100 and 100)
);

create table public.progression_events (
  id uuid primary key default gen_random_uuid(),
  public_event_id text not null default ('pev_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null,
  player_id uuid not null,
  source_domain text not null,
  source_event_type text not null,
  source_public_id text not null,
  idempotency_key text not null,
  experience_delta integer not null,
  country_reputation_delta integer not null default 0,
  career_reputation_delta integer not null default 0,
  story_reputation_delta integer not null default 0,
  relationship_reputation_delta integer not null default 0,
  counter_key text not null,
  counter_increment integer not null default 1,
  award_outcome text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint progression_events_profile_fk foreign key (game_session_id, player_id)
    references public.player_progression_profiles(game_session_id, player_id) on delete cascade,
  constraint progression_events_public_id_unique unique (public_event_id),
  constraint progression_events_public_id_format check (public_event_id ~ '^pev_[0-9a-f]{32}$'),
  constraint progression_events_source_domain_valid check (source_domain in ('contracts','business','crafting','market','story','relationship','country','admin')),
  constraint progression_events_source_type_valid check (source_event_type ~ '^[a-z][a-z0-9_.-]{2,80}$'),
  constraint progression_events_source_id_valid check (source_public_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  constraint progression_events_idempotency_valid check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint progression_events_delta_valid check (
    experience_delta between -5000 and 5000
    and country_reputation_delta between -20 and 20
    and career_reputation_delta between -20 and 20
    and story_reputation_delta between -20 and 20
    and relationship_reputation_delta between -20 and 20
  ),
  constraint progression_events_counter_valid check (counter_key ~ '^[a-z][a-z0-9_.-]{2,80}$' and counter_increment between 0 and 100),
  constraint progression_events_outcome_valid check (award_outcome in ('applied','capped','replayed','corrected')),
  constraint progression_events_idempotency_unique unique (game_session_id, source_domain, idempotency_key)
);

create index progression_events_player_created_idx
  on public.progression_events (game_session_id, player_id, created_at desc);
create index progression_events_daily_cap_idx
  on public.progression_events (game_session_id, player_id, source_event_type, occurred_at);

create table public.player_progression_counters (
  game_session_id uuid not null,
  player_id uuid not null,
  counter_key text not null,
  counter_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (game_session_id, player_id, counter_key),
  constraint player_progression_counter_profile_fk foreign key (game_session_id, player_id)
    references public.player_progression_profiles(game_session_id, player_id) on delete cascade,
  constraint player_progression_counter_key_valid check (counter_key ~ '^[a-z][a-z0-9_.-]{2,80}$'),
  constraint player_progression_counter_value_valid check (counter_value between 0 and 1000000000)
);

create table public.player_progression_skills (
  public_unlock_id text primary key default ('pun_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null,
  player_id uuid not null,
  public_skill_id text not null references public.progression_skill_definitions(public_skill_id) on delete restrict,
  unlocked_at timestamptz not null default now(),
  constraint player_progression_skill_profile_fk foreign key (game_session_id, player_id)
    references public.player_progression_profiles(game_session_id, player_id) on delete cascade,
  constraint player_progression_unlock_id_format check (public_unlock_id ~ '^pun_[0-9a-f]{32}$'),
  constraint player_progression_skill_unique unique (game_session_id, player_id, public_skill_id)
);

create table public.player_achievement_progress (
  public_completion_id text null,
  game_session_id uuid not null,
  player_id uuid not null,
  public_achievement_id text not null references public.progression_achievement_definitions(public_achievement_id) on delete restrict,
  current_value bigint not null default 0,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (game_session_id, player_id, public_achievement_id),
  constraint player_achievement_profile_fk foreign key (game_session_id, player_id)
    references public.player_progression_profiles(game_session_id, player_id) on delete cascade,
  constraint player_achievement_completion_id_format check (public_completion_id is null or public_completion_id ~ '^pac_[0-9a-f]{32}$'),
  constraint player_achievement_progress_valid check (current_value between 0 and 1000000000),
  constraint player_achievement_completion_valid check ((completed_at is null and public_completion_id is null) or (completed_at is not null and public_completion_id is not null)),
  constraint player_achievement_completion_unique unique (public_completion_id)
);

create table public.player_progression_reward_grants (
  public_reward_id text primary key default ('rwd_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null,
  player_id uuid not null,
  source_type text not null,
  source_public_id text not null,
  reward_kind text not null,
  amount integer not null,
  reputation_type text null,
  reputation_scope text null,
  status text not null default 'pending',
  claimed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint player_progression_reward_profile_fk foreign key (game_session_id, player_id)
    references public.player_progression_profiles(game_session_id, player_id) on delete cascade,
  constraint player_progression_reward_id_format check (public_reward_id ~ '^rwd_[0-9a-f]{32}$'),
  constraint player_progression_reward_source_valid check (source_type in ('achievement','level','admin') and source_public_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  constraint player_progression_reward_kind_valid check (reward_kind in ('skill_points','reputation','badge')),
  constraint player_progression_reward_amount_valid check (amount between 0 and 20),
  constraint player_progression_reward_rep_valid check (
    (reward_kind <> 'reputation' and reputation_type is null and reputation_scope is null)
    or (reward_kind = 'reputation' and reputation_type in ('country','career','story','relationship') and reputation_scope is not null)
  ),
  constraint player_progression_reward_status_valid check (status in ('pending','claimed')),
  constraint player_progression_reward_claimed_valid check ((status = 'pending' and claimed_at is null) or (status = 'claimed' and claimed_at is not null)),
  constraint player_progression_reward_source_unique unique (game_session_id, player_id, source_type, source_public_id, reward_kind)
);

create table public.progression_command_audit (
  public_command_id text primary key default ('pcd_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  actor_type text not null,
  actor_staff_user_id uuid null references public.staff_users(id) on delete restrict,
  command_type text not null,
  target_public_id text not null,
  idempotency_key text not null,
  outcome text not null,
  created_at timestamptz not null default now(),
  constraint progression_command_player_scope_fk foreign key (game_session_id, player_id)
    references public.players(game_session_id, id) on delete cascade,
  constraint progression_command_id_format check (public_command_id ~ '^pcd_[0-9a-f]{32}$'),
  constraint progression_command_actor_valid check (
    (actor_type = 'player' and actor_staff_user_id is null)
    or (actor_type = 'staff' and actor_staff_user_id is not null)
    or (actor_type = 'system' and actor_staff_user_id is null)
  ),
  constraint progression_command_type_valid check (command_type in ('unlock_skill','claim_reward','admin_correction')),
  constraint progression_command_target_valid check (target_public_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  constraint progression_command_idempotency_valid check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint progression_command_outcome_valid check (outcome in ('applied','replayed')),
  constraint progression_command_idempotency_unique unique (game_session_id, player_id, actor_type, idempotency_key)
);

create table public.progression_admin_corrections (
  public_correction_id text primary key default ('pcr_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  staff_user_id uuid not null references public.staff_users(id) on delete restrict,
  correction_type text not null,
  amount integer not null,
  reputation_type text null,
  reputation_scope text null,
  reason text not null,
  idempotency_key text not null,
  before_value integer not null,
  after_value integer not null,
  created_at timestamptz not null default now(),
  constraint progression_admin_correction_player_scope_fk foreign key (game_session_id, player_id)
    references public.players(game_session_id, id) on delete cascade,
  constraint progression_admin_correction_id_format check (public_correction_id ~ '^pcr_[0-9a-f]{32}$'),
  constraint progression_admin_correction_type_valid check (correction_type in ('experience','reputation')),
  constraint progression_admin_correction_amount_valid check (amount between -5000 and 5000 and amount <> 0),
  constraint progression_admin_correction_rep_valid check (
    (correction_type = 'experience' and reputation_type is null and reputation_scope is null)
    or (correction_type = 'reputation' and reputation_type in ('country','career','story','relationship') and reputation_scope is not null)
  ),
  constraint progression_admin_correction_reason_valid check (length(btrim(reason)) between 3 and 1000 and reason !~ '[[:cntrl:]]'),
  constraint progression_admin_correction_idempotency_valid check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint progression_admin_correction_idempotency_unique unique (game_session_id, staff_user_id, idempotency_key)
);

create index progression_admin_corrections_game_created_idx
  on public.progression_admin_corrections (game_session_id, created_at desc);

alter table public.progression_skill_definitions enable row level security;
alter table public.progression_achievement_definitions enable row level security;
alter table public.player_progression_profiles enable row level security;
alter table public.player_reputation_scores enable row level security;
alter table public.progression_events enable row level security;
alter table public.player_progression_counters enable row level security;
alter table public.player_progression_skills enable row level security;
alter table public.player_achievement_progress enable row level security;
alter table public.player_progression_reward_grants enable row level security;
alter table public.progression_command_audit enable row level security;
alter table public.progression_admin_corrections enable row level security;

alter table public.progression_skill_definitions force row level security;
alter table public.progression_achievement_definitions force row level security;
alter table public.player_progression_profiles force row level security;
alter table public.player_reputation_scores force row level security;
alter table public.progression_events force row level security;
alter table public.player_progression_counters force row level security;
alter table public.player_progression_skills force row level security;
alter table public.player_achievement_progress force row level security;
alter table public.player_progression_reward_grants force row level security;
alter table public.progression_command_audit force row level security;
alter table public.progression_admin_corrections force row level security;

revoke all on table public.progression_skill_definitions from public, anon, authenticated;
revoke all on table public.progression_achievement_definitions from public, anon, authenticated;
revoke all on table public.player_progression_profiles from public, anon, authenticated;
revoke all on table public.player_reputation_scores from public, anon, authenticated;
revoke all on table public.progression_events from public, anon, authenticated;
revoke all on table public.player_progression_counters from public, anon, authenticated;
revoke all on table public.player_progression_skills from public, anon, authenticated;
revoke all on table public.player_achievement_progress from public, anon, authenticated;
revoke all on table public.player_progression_reward_grants from public, anon, authenticated;
revoke all on table public.progression_command_audit from public, anon, authenticated;
revoke all on table public.progression_admin_corrections from public, anon, authenticated;

grant select on table public.progression_skill_definitions to service_role;
grant select on table public.progression_achievement_definitions to service_role;
grant select, insert, update, delete on table public.player_progression_profiles to service_role;
grant select, insert, update, delete on table public.player_reputation_scores to service_role;
grant select, insert on table public.progression_events to service_role;
grant select, insert, update on table public.player_progression_counters to service_role;
grant select, insert on table public.player_progression_skills to service_role;
grant select, insert, update on table public.player_achievement_progress to service_role;
grant select, insert, update on table public.player_progression_reward_grants to service_role;
grant select, insert on table public.progression_command_audit to service_role;
grant select, insert on table public.progression_admin_corrections to service_role;

create or replace function public.progression_level_threshold_v1(p_level integer)
returns bigint
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select case p_level
    when 1 then 0 when 2 then 100 when 3 then 250 when 4 then 450 when 5 then 700
    when 6 then 1000 when 7 then 1350 when 8 then 1750 when 9 then 2200 when 10 then 2700
    when 11 then 3250 when 12 then 3850 when 13 then 4500 when 14 then 5200 when 15 then 5950
    when 16 then 6750 when 17 then 7600 when 18 then 8500 when 19 then 9450 when 20 then 10450
    else 10450
  end::bigint;
$$;

create or replace function public.progression_level_for_experience_v1(p_experience bigint)
returns integer
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select greatest(1, least(20, coalesce((
    select max(level_value)
    from generate_series(1, 20) as level_value
    where public.progression_level_threshold_v1(level_value) <= greatest(p_experience, 0)
  ), 1)))::integer;
$$;

create or replace function public.ensure_player_progression_profile_v1(
  p_game_session_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PROGRESSION_SCOPE_INVALID' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.players as player_row
    where player_row.game_session_id = p_game_session_id
      and player_row.id = p_player_id
      and player_row.archived_at is null
  ) then
    raise exception 'PROGRESSION_PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.player_progression_profiles (game_session_id, player_id)
  values (p_game_session_id, p_player_id)
  on conflict (game_session_id, player_id) do nothing;
  insert into public.player_reputation_scores (
    game_session_id, player_id, reputation_type, scope_key, score, is_public
  ) values
    (p_game_session_id, p_player_id, 'country', 'assigned', 0, true),
    (p_game_session_id, p_player_id, 'career', 'general', 0, true),
    (p_game_session_id, p_player_id, 'story', 'campaign', 0, false),
    (p_game_session_id, p_player_id, 'relationship', 'general', 0, false)
  on conflict (game_session_id, player_id, reputation_type, scope_key) do nothing;
end;
$function$;

create or replace function public.increment_player_progression_counter_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_counter_key text,
  p_increment integer
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_value bigint;
begin
  if p_counter_key is null or p_counter_key !~ '^[a-z][a-z0-9_.-]{2,80}$'
    or p_increment is null or p_increment not between 0 and 100 then
    raise exception 'PROGRESSION_COUNTER_INVALID' using errcode = 'P0001';
  end if;
  insert into public.player_progression_counters (
    game_session_id, player_id, counter_key, counter_value, updated_at
  ) values (
    p_game_session_id, p_player_id, p_counter_key, p_increment, now()
  )
  on conflict (game_session_id, player_id, counter_key) do update
    set counter_value = least(1000000000, public.player_progression_counters.counter_value + excluded.counter_value),
        updated_at = now()
  returning counter_value into v_value;
  return v_value;
end;
$function$;

create or replace function public.evaluate_player_progression_achievements_v1(
  p_game_session_id uuid,
  p_player_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_definition public.progression_achievement_definitions%rowtype;
  v_current bigint;
  v_completed integer := 0;
  v_completion_id text;
begin
  for v_definition in
    select * from public.progression_achievement_definitions where active = true
  loop
    select coalesce(counter_row.counter_value, 0)
    into v_current
    from (select 1) as seed
    left join public.player_progression_counters as counter_row
      on counter_row.game_session_id = p_game_session_id
      and counter_row.player_id = p_player_id
      and counter_row.counter_key = v_definition.criterion_key;

    insert into public.player_achievement_progress (
      game_session_id, player_id, public_achievement_id, current_value, updated_at
    ) values (
      p_game_session_id, p_player_id, v_definition.public_achievement_id, v_current, now()
    )
    on conflict (game_session_id, player_id, public_achievement_id) do update
      set current_value = greatest(public.player_achievement_progress.current_value, excluded.current_value),
          updated_at = now();

    if v_current >= v_definition.threshold then
      update public.player_achievement_progress
      set public_completion_id = coalesce(public_completion_id, 'pac_' || replace(gen_random_uuid()::text, '-', '')),
          completed_at = coalesce(completed_at, now()),
          current_value = greatest(current_value, v_definition.threshold),
          updated_at = now()
      where game_session_id = p_game_session_id
        and player_id = p_player_id
        and public_achievement_id = v_definition.public_achievement_id
        and completed_at is null
      returning public_completion_id into v_completion_id;

      if v_completion_id is not null then
        v_completed := v_completed + 1;
        if v_definition.reward_skill_points > 0 then
          insert into public.player_progression_reward_grants (
            game_session_id, player_id, source_type, source_public_id,
            reward_kind, amount
          ) values (
            p_game_session_id, p_player_id, 'achievement', v_definition.public_achievement_id,
            'skill_points', v_definition.reward_skill_points
          ) on conflict do nothing;
        elsif v_definition.reward_reputation_type is not null then
          insert into public.player_progression_reward_grants (
            game_session_id, player_id, source_type, source_public_id,
            reward_kind, amount, reputation_type, reputation_scope
          ) values (
            p_game_session_id, p_player_id, 'achievement', v_definition.public_achievement_id,
            'reputation', v_definition.reward_reputation_delta,
            v_definition.reward_reputation_type, v_definition.reward_reputation_scope
          ) on conflict do nothing;
        else
          insert into public.player_progression_reward_grants (
            game_session_id, player_id, source_type, source_public_id,
            reward_kind, amount
          ) values (
            p_game_session_id, p_player_id, 'achievement', v_definition.public_achievement_id,
            'badge', 0
          ) on conflict do nothing;
        end if;
      end if;
    end if;
    v_completion_id := null;
  end loop;
  return v_completed;
end;
$function$;

create or replace function public.apply_player_reputation_delta_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_reputation_type text,
  p_scope_key text,
  p_delta integer
)
returns table (before_score integer, after_score integer, recovered boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_before integer;
  v_after integer;
begin
  if p_reputation_type not in ('country','career','story','relationship')
    or p_scope_key is null or p_scope_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
    or p_delta is null or p_delta not between -20 and 20 then
    raise exception 'PROGRESSION_REPUTATION_INVALID' using errcode = 'P0001';
  end if;
  insert into public.player_reputation_scores (
    game_session_id, player_id, reputation_type, scope_key, score, is_public
  ) values (
    p_game_session_id, p_player_id, p_reputation_type, p_scope_key, 0,
    p_reputation_type in ('country','career')
  ) on conflict do nothing;
  select score into v_before
  from public.player_reputation_scores
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and reputation_type = p_reputation_type
    and scope_key = p_scope_key
  for update;
  v_after := greatest(-100, least(100, v_before + p_delta));
  update public.player_reputation_scores
  set score = v_after, updated_at = now()
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and reputation_type = p_reputation_type
    and scope_key = p_scope_key;
  return query select v_before, v_after, (v_before < 0 and v_after >= 0);
end;
$function$;

create or replace function public.record_progression_integration_event_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_source_domain text,
  p_event_type text,
  p_source_public_id text,
  p_idempotency_key text,
  p_occurred_at timestamptz default now()
)
returns table (
  event_outcome text,
  event_id text,
  experience_awarded integer,
  resulting_experience bigint,
  resulting_level integer,
  achievements_completed integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_existing public.progression_events%rowtype;
  v_profile public.player_progression_profiles%rowtype;
  v_xp integer;
  v_country integer := 0;
  v_career integer := 0;
  v_story integer := 0;
  v_relationship integer := 0;
  v_counter text;
  v_daily_cap integer;
  v_daily_count integer;
  v_outcome text := 'applied';
  v_event public.progression_events%rowtype;
  v_new_level integer;
  v_old_level integer;
  v_completed integer;
  v_rep record;
begin
  if p_game_session_id is null or p_player_id is null
    or p_source_domain not in ('contracts','business','crafting','market','story','relationship','country')
    or p_event_type is null or p_event_type !~ '^[a-z][a-z0-9_.-]{2,80}$'
    or p_source_public_id is null or p_source_public_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_occurred_at is null or p_occurred_at > now() + interval '5 minutes'
    or p_occurred_at < now() - interval '30 days'
  then
    raise exception 'PROGRESSION_EVENT_INVALID' using errcode = 'P0001';
  end if;

  perform public.ensure_player_progression_profile_v1(p_game_session_id, p_player_id);

  select * into v_existing
  from public.progression_events
  where game_session_id = p_game_session_id
    and source_domain = p_source_domain
    and idempotency_key = p_idempotency_key;
  if found then
    select * into v_profile
    from public.player_progression_profiles
    where game_session_id = p_game_session_id and player_id = p_player_id;
    return query select 'replayed'::text, v_existing.public_event_id,
      v_existing.experience_delta, v_profile.experience, v_profile.level, 0;
    return;
  end if;

  select
    case p_event_type
      when 'contract.completed' then 120
      when 'business.operation.completed' then 90
      when 'crafting.recipe.completed' then 80
      when 'market.order.settled' then 30
      when 'story.chapter.completed' then 150
      when 'relationship.interaction.positive' then 20
      when 'relationship.interaction.negative' then 0
      when 'country.service.completed' then 70
      else null end,
    case p_event_type
      when 'contract.completed' then 'contracts.completed'
      when 'business.operation.completed' then 'business.operations'
      when 'crafting.recipe.completed' then 'crafting.completed'
      when 'market.order.settled' then 'market.settled'
      when 'story.chapter.completed' then 'story.completed'
      when 'relationship.interaction.positive' then 'relationship.positive'
      when 'relationship.interaction.negative' then 'relationship.negative'
      when 'country.service.completed' then 'country.service'
      else null end,
    case p_event_type
      when 'contract.completed' then 10
      when 'business.operation.completed' then 12
      when 'crafting.recipe.completed' then 12
      when 'market.order.settled' then 20
      when 'story.chapter.completed' then 5
      when 'relationship.interaction.positive' then 10
      when 'relationship.interaction.negative' then 10
      when 'country.service.completed' then 10
      else null end
  into v_xp, v_counter, v_daily_cap;

  if v_xp is null then
    raise exception 'PROGRESSION_EVENT_TYPE_UNSUPPORTED' using errcode = 'P0001';
  end if;

  if p_event_type = 'contract.completed' then v_career := 4;
  elsif p_event_type = 'business.operation.completed' then v_career := 3;
  elsif p_event_type = 'crafting.recipe.completed' then v_career := 2;
  elsif p_event_type = 'market.order.settled' then v_country := 1;
  elsif p_event_type = 'story.chapter.completed' then v_story := 6;
  elsif p_event_type = 'relationship.interaction.positive' then v_relationship := 3;
  elsif p_event_type = 'relationship.interaction.negative' then v_relationship := -5;
  elsif p_event_type = 'country.service.completed' then v_country := 4;
  end if;

  select count(*)::integer into v_daily_count
  from public.progression_events
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and source_event_type = p_event_type
    and occurred_at >= date_trunc('day', p_occurred_at)
    and occurred_at < date_trunc('day', p_occurred_at) + interval '1 day';

  if v_daily_count >= v_daily_cap then
    v_outcome := 'capped';
    v_xp := 0;
    v_country := 0;
    v_career := 0;
    v_story := 0;
    v_relationship := 0;
  end if;

  select * into v_profile
  from public.player_progression_profiles
  where game_session_id = p_game_session_id and player_id = p_player_id
  for update;
  v_old_level := v_profile.level;

  insert into public.progression_events (
    game_session_id, player_id, source_domain, source_event_type,
    source_public_id, idempotency_key, experience_delta,
    country_reputation_delta, career_reputation_delta, story_reputation_delta,
    relationship_reputation_delta, counter_key, counter_increment,
    award_outcome, occurred_at
  ) values (
    p_game_session_id, p_player_id, p_source_domain, p_event_type,
    p_source_public_id, p_idempotency_key, v_xp,
    v_country, v_career, v_story, v_relationship, v_counter,
    case when v_outcome = 'applied' then 1 else 0 end,
    v_outcome, p_occurred_at
  ) returning * into v_event;

  update public.player_progression_profiles
  set experience = least(1000000000, greatest(0, experience + v_xp)),
      updated_at = now()
  where game_session_id = p_game_session_id and player_id = p_player_id
  returning experience into v_profile.experience;

  v_new_level := public.progression_level_for_experience_v1(v_profile.experience);
  update public.player_progression_profiles
  set level = v_new_level,
      earned_skill_points = greatest(earned_skill_points, v_new_level - 1),
      public_title = case
        when v_new_level >= 16 then 'Economic Steward'
        when v_new_level >= 12 then 'Established Strategist'
        when v_new_level >= 8 then 'Skilled Operator'
        when v_new_level >= 4 then 'Developing Professional'
        else 'New Arrival' end,
      updated_at = now()
  where game_session_id = p_game_session_id and player_id = p_player_id;

  if v_outcome = 'applied' then
    perform public.increment_player_progression_counter_v1(p_game_session_id, p_player_id, 'events.total', 1);
    perform public.increment_player_progression_counter_v1(p_game_session_id, p_player_id, v_counter, 1);
  end if;
  perform public.increment_player_progression_counter_v1(p_game_session_id, p_player_id, 'level.current', greatest(v_new_level, 0));
  update public.player_progression_counters
  set counter_value = v_new_level, updated_at = now()
  where game_session_id = p_game_session_id and player_id = p_player_id and counter_key = 'level.current';

  if v_country <> 0 then
    select * into v_rep from public.apply_player_reputation_delta_v1(p_game_session_id,p_player_id,'country','assigned',v_country);
    if v_rep.recovered then perform public.increment_player_progression_counter_v1(p_game_session_id,p_player_id,'reputation.recovered',1); end if;
  end if;
  if v_career <> 0 then
    select * into v_rep from public.apply_player_reputation_delta_v1(p_game_session_id,p_player_id,'career','general',v_career);
    if v_rep.recovered then perform public.increment_player_progression_counter_v1(p_game_session_id,p_player_id,'reputation.recovered',1); end if;
  end if;
  if v_story <> 0 then
    select * into v_rep from public.apply_player_reputation_delta_v1(p_game_session_id,p_player_id,'story','campaign',v_story);
    if v_rep.recovered then perform public.increment_player_progression_counter_v1(p_game_session_id,p_player_id,'reputation.recovered',1); end if;
  end if;
  if v_relationship <> 0 then
    select * into v_rep from public.apply_player_reputation_delta_v1(p_game_session_id,p_player_id,'relationship','general',v_relationship);
    if v_rep.recovered then perform public.increment_player_progression_counter_v1(p_game_session_id,p_player_id,'reputation.recovered',1); end if;
  end if;

  v_completed := public.evaluate_player_progression_achievements_v1(p_game_session_id, p_player_id);
  return query select v_outcome, v_event.public_event_id, v_xp,
    v_profile.experience, v_new_level, v_completed;
end;
$function$;

create or replace function public.unlock_player_progression_skill_atomic_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_public_skill_id text,
  p_idempotency_key text
)
returns table (
  unlock_outcome text,
  command_id text,
  unlock_id text,
  skill_id text,
  remaining_skill_points integer,
  unlocked_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_existing public.progression_command_audit%rowtype;
  v_profile public.player_progression_profiles%rowtype;
  v_skill public.progression_skill_definitions%rowtype;
  v_unlock public.player_progression_skills%rowtype;
  v_command public.progression_command_audit%rowtype;
  v_available integer;
  v_tracks integer;
begin
  if p_public_skill_id is null or p_public_skill_id !~ '^skl_[a-z0-9_]{3,64}_v1$'
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception 'PROGRESSION_SKILL_UNLOCK_INVALID' using errcode = 'P0001';
  end if;
  perform public.ensure_player_progression_profile_v1(p_game_session_id, p_player_id);
  select * into v_existing from public.progression_command_audit
  where game_session_id = p_game_session_id and player_id = p_player_id
    and actor_type = 'player' and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.command_type <> 'unlock_skill' or v_existing.target_public_id <> p_public_skill_id then
      raise exception 'PROGRESSION_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    select * into v_unlock from public.player_progression_skills
    where game_session_id = p_game_session_id and player_id = p_player_id and public_skill_id = p_public_skill_id;
    select * into v_profile from public.player_progression_profiles
    where game_session_id = p_game_session_id and player_id = p_player_id;
    return query select 'replayed'::text, v_existing.public_command_id, v_unlock.public_unlock_id,
      p_public_skill_id, (v_profile.earned_skill_points + v_profile.bonus_skill_points - v_profile.spent_skill_points), v_unlock.unlocked_at;
    return;
  end if;
  select * into v_profile from public.player_progression_profiles
  where game_session_id = p_game_session_id and player_id = p_player_id for update;
  select * into v_skill from public.progression_skill_definitions
  where public_skill_id = p_public_skill_id and active = true;
  if not found then raise exception 'PROGRESSION_SKILL_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_profile.level < v_skill.minimum_level then raise exception 'PROGRESSION_SKILL_LEVEL_REQUIRED' using errcode = 'P0001'; end if;
  if v_skill.prerequisite_skill_id is not null and not exists (
    select 1 from public.player_progression_skills
    where game_session_id = p_game_session_id and player_id = p_player_id
      and public_skill_id = v_skill.prerequisite_skill_id
  ) then raise exception 'PROGRESSION_SKILL_PREREQUISITE_REQUIRED' using errcode = 'P0001'; end if;
  if exists (
    select 1 from public.player_progression_skills
    where game_session_id = p_game_session_id and player_id = p_player_id and public_skill_id = p_public_skill_id
  ) then raise exception 'PROGRESSION_SKILL_ALREADY_UNLOCKED' using errcode = 'P0001'; end if;
  v_available := v_profile.earned_skill_points + v_profile.bonus_skill_points - v_profile.spent_skill_points;
  if v_available < v_skill.cost then raise exception 'PROGRESSION_SKILL_POINTS_INSUFFICIENT' using errcode = 'P0001'; end if;
  insert into public.player_progression_skills (game_session_id, player_id, public_skill_id)
  values (p_game_session_id, p_player_id, p_public_skill_id) returning * into v_unlock;
  update public.player_progression_profiles
  set spent_skill_points = spent_skill_points + v_skill.cost, updated_at = now()
  where game_session_id = p_game_session_id and player_id = p_player_id
  returning * into v_profile;
  insert into public.progression_command_audit (
    game_session_id, player_id, actor_type, command_type,
    target_public_id, idempotency_key, outcome
  ) values (
    p_game_session_id, p_player_id, 'player', 'unlock_skill',
    p_public_skill_id, p_idempotency_key, 'applied'
  ) returning * into v_command;
  perform public.increment_player_progression_counter_v1(p_game_session_id,p_player_id,'skills.unlocked',1);
  select count(distinct definition.track)::integer into v_tracks
  from public.player_progression_skills as unlocked
  join public.progression_skill_definitions as definition
    on definition.public_skill_id = unlocked.public_skill_id
  where unlocked.game_session_id = p_game_session_id and unlocked.player_id = p_player_id;
  perform public.increment_player_progression_counter_v1(p_game_session_id,p_player_id,'specialization.tracks',0);
  update public.player_progression_counters
  set counter_value = v_tracks, updated_at = now()
  where game_session_id = p_game_session_id and player_id = p_player_id and counter_key = 'specialization.tracks';
  perform public.evaluate_player_progression_achievements_v1(p_game_session_id,p_player_id);
  return query select 'applied'::text, v_command.public_command_id, v_unlock.public_unlock_id,
    p_public_skill_id, (v_profile.earned_skill_points + v_profile.bonus_skill_points - v_profile.spent_skill_points), v_unlock.unlocked_at;
end;
$function$;

create or replace function public.claim_player_progression_reward_atomic_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_public_reward_id text,
  p_idempotency_key text
)
returns table (
  claim_outcome text,
  command_id text,
  reward_id text,
  reward_kind text,
  amount integer,
  claimed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_existing public.progression_command_audit%rowtype;
  v_reward public.player_progression_reward_grants%rowtype;
  v_command public.progression_command_audit%rowtype;
  v_claimed_at timestamptz;
begin
  if p_public_reward_id is null or p_public_reward_id !~ '^rwd_[0-9a-f]{32}$'
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception 'PROGRESSION_REWARD_CLAIM_INVALID' using errcode = 'P0001';
  end if;
  perform public.ensure_player_progression_profile_v1(p_game_session_id,p_player_id);
  select * into v_existing from public.progression_command_audit
  where game_session_id = p_game_session_id and player_id = p_player_id
    and actor_type = 'player' and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.command_type <> 'claim_reward' or v_existing.target_public_id <> p_public_reward_id then
      raise exception 'PROGRESSION_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    select * into v_reward from public.player_progression_reward_grants
    where game_session_id = p_game_session_id and player_id = p_player_id and public_reward_id = p_public_reward_id;
    return query select 'replayed'::text, v_existing.public_command_id, v_reward.public_reward_id,
      v_reward.reward_kind, v_reward.amount, v_reward.claimed_at;
    return;
  end if;
  select * into v_reward from public.player_progression_reward_grants
  where game_session_id = p_game_session_id and player_id = p_player_id and public_reward_id = p_public_reward_id
  for update;
  if not found then raise exception 'PROGRESSION_REWARD_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_reward.status = 'claimed' then raise exception 'PROGRESSION_REWARD_ALREADY_CLAIMED' using errcode = 'P0001'; end if;
  if v_reward.reward_kind = 'skill_points' then
    update public.player_progression_profiles
    set bonus_skill_points = least(100, bonus_skill_points + v_reward.amount), updated_at = now()
    where game_session_id = p_game_session_id and player_id = p_player_id;
  elsif v_reward.reward_kind = 'reputation' then
    perform public.apply_player_reputation_delta_v1(
      p_game_session_id,p_player_id,v_reward.reputation_type,v_reward.reputation_scope,v_reward.amount
    );
  end if;
  v_claimed_at := now();
  update public.player_progression_reward_grants
  set status = 'claimed', claimed_at = v_claimed_at
  where public_reward_id = p_public_reward_id;
  insert into public.progression_command_audit (
    game_session_id, player_id, actor_type, command_type,
    target_public_id, idempotency_key, outcome
  ) values (
    p_game_session_id,p_player_id,'player','claim_reward',
    p_public_reward_id,p_idempotency_key,'applied'
  ) returning * into v_command;
  return query select 'applied'::text, v_command.public_command_id, v_reward.public_reward_id,
    v_reward.reward_kind, v_reward.amount, v_claimed_at;
end;
$function$;

create or replace function public.read_player_progression_v1(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  v_profile public.player_progression_profiles%rowtype;
  v_player record;
  v_next bigint;
  v_result jsonb;
begin
  perform public.ensure_player_progression_profile_v1(p_game_session_id,p_player_id);
  select profile_row.*, player_row.display_name, player_row.player_identifier, player_row.roster_label
  into v_player
  from public.player_progression_profiles as profile_row
  join public.players as player_row
    on player_row.game_session_id = profile_row.game_session_id and player_row.id = profile_row.player_id
  where profile_row.game_session_id = p_game_session_id and profile_row.player_id = p_player_id
    and player_row.archived_at is null;
  if not found then raise exception 'PROGRESSION_PLAYER_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into v_profile from public.player_progression_profiles
  where game_session_id = p_game_session_id and player_id = p_player_id;
  v_next := case when v_profile.level >= 20 then v_profile.experience else public.progression_level_threshold_v1(v_profile.level + 1) end;

  select jsonb_build_object(
    'playerName', v_player.display_name,
    'title', v_profile.public_title,
    'summary', v_profile.public_summary,
    'level', v_profile.level,
    'xp', v_profile.experience,
    'currentLevelXp', public.progression_level_threshold_v1(v_profile.level),
    'nextLevelXp', v_next,
    'skillPoints', v_profile.earned_skill_points + v_profile.bonus_skill_points - v_profile.spent_skill_points,
    'reputation', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', reputation_row.reputation_type,
        'scope', reputation_row.scope_key,
        'name', initcap(reputation_row.reputation_type) || ' reputation',
        'label', case when reputation_row.score >= 60 then 'Trusted' when reputation_row.score >= 20 then 'Positive' when reputation_row.score >= -19 then 'Neutral' when reputation_row.score >= -59 then 'Strained' else 'Critical' end,
        'score', reputation_row.score,
        'displayScore', reputation_row.score + 100,
        'public', reputation_row.is_public,
        'icon', case reputation_row.reputation_type when 'country' then 'globe' when 'career' then 'briefcase' when 'story' then 'book' else 'users' end
      ) order by reputation_row.reputation_type, reputation_row.scope_key)
      from public.player_reputation_scores as reputation_row
      where reputation_row.game_session_id = p_game_session_id and reputation_row.player_id = p_player_id
    ), '[]'::jsonb),
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', achievement.public_achievement_id,
        'title', achievement.name,
        'detail', achievement.description,
        'progress', least(100, floor(100.0 * coalesce(progress.current_value,0) / achievement.threshold))::integer,
        'icon', 'target'
      ) order by least(100, floor(100.0 * coalesce(progress.current_value,0) / achievement.threshold)) desc, achievement.public_achievement_id)
      from public.progression_achievement_definitions as achievement
      left join public.player_achievement_progress as progress
        on progress.game_session_id = p_game_session_id and progress.player_id = p_player_id
        and progress.public_achievement_id = achievement.public_achievement_id
      where achievement.active = true and progress.completed_at is null
      limit 6
    ), '[]'::jsonb),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', definition.public_skill_id,
        'category', initcap(definition.track),
        'track', definition.track,
        'tier', definition.tier,
        'name', definition.name,
        'description', definition.description,
        'cost', definition.cost,
        'minimumLevel', definition.minimum_level,
        'prerequisiteSkillId', definition.prerequisite_skill_id,
        'capability', definition.access_capability,
        'effectBasisPoints', definition.effect_basis_points,
        'unlocked', unlocked.public_unlock_id is not null,
        'unlockId', unlocked.public_unlock_id,
        'icon', case definition.track when 'markets' then 'chart' when 'enterprise' then 'briefcase' when 'production' then 'wrench' else 'users' end
      ) order by definition.track, definition.tier)
      from public.progression_skill_definitions as definition
      left join public.player_progression_skills as unlocked
        on unlocked.game_session_id = p_game_session_id and unlocked.player_id = p_player_id
        and unlocked.public_skill_id = definition.public_skill_id
      where definition.active = true
    ), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', definition.public_achievement_id,
        'name', definition.name,
        'description', definition.description,
        'currentValue', coalesce(progress.current_value,0),
        'threshold', definition.threshold,
        'progressText', least(coalesce(progress.current_value,0), definition.threshold) || ' / ' || definition.threshold,
        'complete', progress.completed_at is not null,
        'completedAt', progress.completed_at,
        'claimable', reward.status = 'pending',
        'rewardId', reward.public_reward_id,
        'rewardKind', reward.reward_kind,
        'rewardAmount', reward.amount
      ) order by (progress.completed_at is not null) desc, definition.public_achievement_id)
      from public.progression_achievement_definitions as definition
      left join public.player_achievement_progress as progress
        on progress.game_session_id = p_game_session_id and progress.player_id = p_player_id
        and progress.public_achievement_id = definition.public_achievement_id
      left join public.player_progression_reward_grants as reward
        on reward.game_session_id = p_game_session_id and reward.player_id = p_player_id
        and reward.source_type = 'achievement' and reward.source_public_id = definition.public_achievement_id
      where definition.active = true
    ), '[]'::jsonb),
    'licenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', unlocked.public_unlock_id,
        'name', definition.name,
        'issuer', 'Econovaria Progression Office',
        'description', definition.description,
        'status', 'Active',
        'capability', definition.access_capability,
        'icon', 'certificate'
      ) order by unlocked.unlocked_at)
      from public.player_progression_skills as unlocked
      join public.progression_skill_definitions as definition on definition.public_skill_id = unlocked.public_skill_id
      where unlocked.game_session_id = p_game_session_id and unlocked.player_id = p_player_id
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.read_public_player_progression_profile_v1(
  p_game_session_id uuid,
  p_player_identifier text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  v_player_id uuid;
  v_profile public.player_progression_profiles%rowtype;
  v_display_name text;
  v_result jsonb;
begin
  if p_player_identifier is null or length(btrim(p_player_identifier)) not between 1 and 160 then
    raise exception 'PROGRESSION_PUBLIC_PROFILE_INVALID' using errcode = 'P0001';
  end if;
  select player_row.id, player_row.display_name into v_player_id, v_display_name
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.player_identifier_normalized = lower(btrim(p_player_identifier))
    and player_row.archived_at is null;
  if v_player_id is null then raise exception 'PROGRESSION_PUBLIC_PROFILE_NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.ensure_player_progression_profile_v1(p_game_session_id,v_player_id);
  select * into v_profile from public.player_progression_profiles
  where game_session_id = p_game_session_id and player_id = v_player_id;
  select jsonb_build_object(
    'playerId', p_player_identifier,
    'displayName', v_display_name,
    'title', v_profile.public_title,
    'summary', v_profile.public_summary,
    'level', v_profile.level,
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object('id',definition.public_achievement_id,'name',definition.name,'completedAt',progress.completed_at)
        order by progress.completed_at desc)
      from public.player_achievement_progress as progress
      join public.progression_achievement_definitions as definition on definition.public_achievement_id = progress.public_achievement_id
      where progress.game_session_id = p_game_session_id and progress.player_id = v_player_id and progress.completed_at is not null
    ), '[]'::jsonb),
    'reputation', coalesce((
      select jsonb_agg(jsonb_build_object('type',reputation_type,'scope',scope_key,'score',score)
        order by reputation_type,scope_key)
      from public.player_reputation_scores
      where game_session_id = p_game_session_id and player_id = v_player_id and is_public = true
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.read_admin_progression_players_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 10000 then
    raise exception 'PROGRESSION_ADMIN_READ_INVALID' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.game_sessions
    where id = p_game_session_id and owner_staff_user_id = p_staff_user_id
  ) then raise exception 'PROGRESSION_ADMIN_SCOPE_FORBIDDEN' using errcode = 'P0001'; end if;
  insert into public.player_progression_profiles (game_session_id, player_id)
  select p_game_session_id, player_row.id
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id and player_row.archived_at is null
  on conflict do nothing;
  select jsonb_build_object(
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', player_row.player_identifier,
        'displayName', player_row.display_name,
        'rosterLabel', player_row.roster_label,
        'level', profile.level,
        'experience', profile.experience,
        'availableSkillPoints', profile.earned_skill_points + profile.bonus_skill_points - profile.spent_skill_points,
        'skillCount', (select count(*) from public.player_progression_skills as skill where skill.game_session_id = p_game_session_id and skill.player_id = player_row.id),
        'achievementCount', (select count(*) from public.player_achievement_progress as achievement where achievement.game_session_id = p_game_session_id and achievement.player_id = player_row.id and achievement.completed_at is not null),
        'reputation', coalesce((select jsonb_object_agg(reputation_type,score) from public.player_reputation_scores as reputation where reputation.game_session_id = p_game_session_id and reputation.player_id = player_row.id and scope_key in ('assigned','general','campaign')), '{}'::jsonb),
        'updatedAt', profile.updated_at
      ) order by player_row.display_name, player_row.player_identifier)
      from (
        select * from public.players
        where game_session_id = p_game_session_id and archived_at is null
        order by display_name, player_identifier
        limit p_limit offset p_offset
      ) as player_row
      join public.player_progression_profiles as profile
        on profile.game_session_id = p_game_session_id and profile.player_id = player_row.id
    ), '[]'::jsonb),
    'pagination', jsonb_build_object('limit',p_limit,'offset',p_offset)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.apply_admin_progression_correction_atomic_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_player_identifier text,
  p_correction_type text,
  p_amount integer,
  p_reputation_type text,
  p_reputation_scope text,
  p_reason text,
  p_idempotency_key text
)
returns table (
  correction_outcome text,
  correction_id text,
  player_id text,
  correction_type text,
  before_value integer,
  after_value integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_existing public.progression_admin_corrections%rowtype;
  v_player uuid;
  v_player_public text;
  v_before integer;
  v_after integer;
  v_correction public.progression_admin_corrections%rowtype;
  v_profile public.player_progression_profiles%rowtype;
begin
  if p_correction_type not in ('experience','reputation')
    or p_amount is null or p_amount not between -5000 and 5000 or p_amount = 0
    or p_reason is null or length(btrim(p_reason)) not between 3 and 1000 or p_reason ~ '[[:cntrl:]]'
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or (p_correction_type = 'experience' and (p_reputation_type is not null or p_reputation_scope is not null))
    or (p_correction_type = 'reputation' and (p_reputation_type not in ('country','career','story','relationship') or p_reputation_scope is null))
  then raise exception 'PROGRESSION_ADMIN_CORRECTION_INVALID' using errcode = 'P0001'; end if;
  if not exists (
    select 1 from public.game_sessions where id = p_game_session_id and owner_staff_user_id = p_staff_user_id
  ) then raise exception 'PROGRESSION_ADMIN_SCOPE_FORBIDDEN' using errcode = 'P0001'; end if;
  select * into v_existing from public.progression_admin_corrections
  where game_session_id = p_game_session_id and staff_user_id = p_staff_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.correction_type <> p_correction_type or v_existing.amount <> p_amount
      or coalesce(v_existing.reputation_type,'') <> coalesce(p_reputation_type,'')
      or coalesce(v_existing.reputation_scope,'') <> coalesce(p_reputation_scope,'')
      or v_existing.reason <> btrim(p_reason)
    then raise exception 'PROGRESSION_IDEMPOTENCY_CONFLICT' using errcode = 'P0001'; end if;
    select player_identifier into v_player_public from public.players
    where game_session_id = p_game_session_id and id = v_existing.player_id;
    return query select 'replayed'::text,v_existing.public_correction_id,v_player_public,
      v_existing.correction_type,v_existing.before_value,v_existing.after_value,v_existing.created_at;
    return;
  end if;
  select id,player_identifier into v_player,v_player_public
  from public.players
  where game_session_id = p_game_session_id
    and player_identifier_normalized = lower(btrim(p_player_identifier))
    and archived_at is null;
  if v_player is null then raise exception 'PROGRESSION_PLAYER_NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.ensure_player_progression_profile_v1(p_game_session_id,v_player);
  if p_correction_type = 'experience' then
    select * into v_profile from public.player_progression_profiles
    where game_session_id = p_game_session_id and player_id = v_player for update;
    v_before := least(2147483647, v_profile.experience)::integer;
    v_after := greatest(0, least(1000000000, v_profile.experience + p_amount))::integer;
    update public.player_progression_profiles
    set experience = v_after,
        level = public.progression_level_for_experience_v1(v_after),
        earned_skill_points = greatest(earned_skill_points, public.progression_level_for_experience_v1(v_after) - 1),
        updated_at = now()
    where game_session_id = p_game_session_id and player_id = v_player;
    perform public.increment_player_progression_counter_v1(p_game_session_id,v_player,'level.current',0);
    update public.player_progression_counters
    set counter_value = public.progression_level_for_experience_v1(v_after), updated_at = now()
    where game_session_id = p_game_session_id and player_id = v_player and counter_key = 'level.current';
  else
    select before_score,after_score into v_before,v_after
    from public.apply_player_reputation_delta_v1(
      p_game_session_id,v_player,p_reputation_type,p_reputation_scope,p_amount
    );
  end if;
  insert into public.progression_admin_corrections (
    game_session_id,player_id,staff_user_id,correction_type,amount,
    reputation_type,reputation_scope,reason,idempotency_key,before_value,after_value
  ) values (
    p_game_session_id,v_player,p_staff_user_id,p_correction_type,p_amount,
    p_reputation_type,p_reputation_scope,btrim(p_reason),p_idempotency_key,v_before,v_after
  ) returning * into v_correction;
  insert into public.progression_command_audit (
    game_session_id,player_id,actor_type,actor_staff_user_id,command_type,
    target_public_id,idempotency_key,outcome
  ) values (
    p_game_session_id,v_player,'staff',p_staff_user_id,'admin_correction',
    v_correction.public_correction_id,p_idempotency_key,'applied'
  );
  perform public.evaluate_player_progression_achievements_v1(p_game_session_id,v_player);
  return query select 'applied'::text,v_correction.public_correction_id,v_player_public,
    v_correction.correction_type,v_before,v_after,v_correction.created_at;
end;
$function$;

create or replace function public.refuse_progression_audit_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  raise exception 'PROGRESSION_AUDIT_IMMUTABLE' using errcode = 'P0001';
end;
$function$;

create trigger refuse_progression_command_audit_mutation_v1
before update or delete on public.progression_command_audit
for each row execute function public.refuse_progression_audit_mutation_v1();

create trigger refuse_progression_admin_correction_mutation_v1
before update or delete on public.progression_admin_corrections
for each row execute function public.refuse_progression_audit_mutation_v1();

revoke all on function public.progression_level_threshold_v1(integer) from public, anon, authenticated;
revoke all on function public.progression_level_for_experience_v1(bigint) from public, anon, authenticated;
revoke all on function public.ensure_player_progression_profile_v1(uuid,uuid) from public, anon, authenticated;
revoke all on function public.increment_player_progression_counter_v1(uuid,uuid,text,integer) from public, anon, authenticated;
revoke all on function public.evaluate_player_progression_achievements_v1(uuid,uuid) from public, anon, authenticated;
revoke all on function public.apply_player_reputation_delta_v1(uuid,uuid,text,text,integer) from public, anon, authenticated;
revoke all on function public.record_progression_integration_event_v1(uuid,uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.unlock_player_progression_skill_atomic_v1(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.claim_player_progression_reward_atomic_v1(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.read_player_progression_v1(uuid,uuid) from public, anon, authenticated;
revoke all on function public.read_public_player_progression_profile_v1(uuid,text) from public, anon, authenticated;
revoke all on function public.read_admin_progression_players_v1(uuid,uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.apply_admin_progression_correction_atomic_v1(uuid,uuid,text,text,integer,text,text,text,text) from public, anon, authenticated;
revoke all on function public.refuse_progression_audit_mutation_v1() from public, anon, authenticated;

grant execute on function public.record_progression_integration_event_v1(uuid,uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.unlock_player_progression_skill_atomic_v1(uuid,uuid,text,text) to service_role;
grant execute on function public.claim_player_progression_reward_atomic_v1(uuid,uuid,text,text) to service_role;
grant execute on function public.read_player_progression_v1(uuid,uuid) to service_role;
grant execute on function public.read_public_player_progression_profile_v1(uuid,text) to service_role;
grant execute on function public.read_admin_progression_players_v1(uuid,uuid,integer,integer) to service_role;
grant execute on function public.apply_admin_progression_correction_atomic_v1(uuid,uuid,text,text,integer,text,text,text,text) to service_role;

comment on function public.record_progression_integration_event_v1(uuid,uuid,text,text,text,text,timestamptz) is
  'Canonical versioned Progression event ingress. Awards are server-derived, idempotent, daily capped, game scoped, and replay safe.';
comment on table public.progression_command_audit is
  'Immutable public-ID command evidence for Player unlocks, Player claims, and Admin corrections.';
comment on table public.progression_admin_corrections is
  'Immutable owner-scoped correction evidence. No access codes, tokens, or private payload blobs are stored.';

commit;
