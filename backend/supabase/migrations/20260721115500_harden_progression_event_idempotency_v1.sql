begin;

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
    if v_existing.player_id <> p_player_id
      or v_existing.source_event_type <> p_event_type
      or v_existing.source_public_id <> p_source_public_id
      or v_existing.occurred_at <> p_occurred_at
    then
      raise exception 'PROGRESSION_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
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
  perform public.increment_player_progression_counter_v1(p_game_session_id, p_player_id, 'level.current', 0);
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

revoke all on function public.record_progression_integration_event_v1(uuid,uuid,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_progression_integration_event_v1(uuid,uuid,text,text,text,text,timestamptz)
  to service_role;

comment on function public.record_progression_integration_event_v1(uuid,uuid,text,text,text,text,timestamptz) is
  'Canonical versioned Progression event ingress. Exact retries replay only when game, Player, event type, source identifier, and occurrence time match; conflicting reuse fails closed.';

commit;
