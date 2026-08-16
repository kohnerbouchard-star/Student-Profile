begin;

-- Meridian elapsed-time story must start when the classroom actually enters
-- the narrative, not when a game was provisioned days earlier. This cutover
-- preserves every already-existing campaign exactly as-is and changes only
-- games whose first arrival happens after this migration commits.
--
-- Existing games are marked `grandfathered` and receive explicit Stage 4-6
-- overrides before those shared definitions become globally dormant. New
-- games are `arrival_anchored`: first arrival rebases story_started_at and
-- enables the complete elapsed-time Meridian spine for that game only.

lock table public.game_session_storylines in share row exclusive mode;
lock table public.player_story_impacts in share row exclusive mode;

-- Record the release mode before changing shared activation. This is the
-- durable safety marker that prevents a future first arrival in an old game
-- from resetting its clock or injecting newly-authored historical content.
insert into public.game_session_story_flags (
  game_session_id,
  flag_key,
  value,
  source_story_event_id,
  created_at
)
select
  activation.game_session_id,
  'meridian_arrival_clock_mode_v1',
  to_jsonb('grandfathered'::text),
  null,
  now()
from public.game_session_storylines as activation
join public.storylines as storyline
  on storyline.id = activation.storyline_id
where lower(storyline.key) = lower('econovaria_demo_act_1')
on conflict (game_session_id, flag_key) do nothing;

-- Stage 4-6 were historically global-active elapsed-time definitions. Preserve
-- their exact availability for every pre-cutover campaign with explicit
-- game-scoped overrides, then make the reusable definitions dormant.
insert into public.game_session_story_event_overrides (
  game_session_id,
  storyline_event_id,
  enabled,
  source_player_story_impact_id,
  enabled_at,
  updated_at
)
select
  activation.game_session_id,
  event_row.id,
  true,
  null,
  now(),
  now()
from public.game_session_storylines as activation
join public.storylines as storyline
  on storyline.id = activation.storyline_id
join public.storyline_events as event_row
  on event_row.storyline_id = storyline.id
where lower(storyline.key) = lower('econovaria_demo_act_1')
  and event_row.event_key in (
    'meridian_customs_security_intrusion',
    'meridian_security_center_attack',
    'meridian_emergency_response'
  )
on conflict (game_session_id, storyline_event_id) do nothing;

-- After grandfather availability is snapshotted, ensure the reusable Stage
-- 4-6 definitions exist for future arrival-anchored campaigns. If an old
-- deployment never initialized them, they are created only now and therefore
-- intentionally receive no grandfather override. The following UPDATE makes
-- every such shared row dormant before this transaction becomes visible.
do $ensure_legacy_definitions$
declare
  v_game_session_id uuid;
begin
  if exists (
    select 1
    from public.storylines as storyline
    where lower(storyline.key) = lower('econovaria_demo_act_1')
      and storyline.is_active
  ) then
    select session.id
    into v_game_session_id
    from public.game_sessions as session
    order by session.created_at asc
    limit 1;

    if v_game_session_id is not null then
      perform public.initialize_meridian_customs_security_intrusion_v1(v_game_session_id);
      perform public.initialize_meridian_security_center_attack_v1(v_game_session_id);
      perform public.initialize_meridian_emergency_response_v1(v_game_session_id);
    end if;
  end if;
end;
$ensure_legacy_definitions$;

update public.storyline_events as event_row
set is_active = false
from public.storylines as storyline
where storyline.id = event_row.storyline_id
  and lower(storyline.key) = lower('econovaria_demo_act_1')
  and event_row.event_key in (
    'meridian_customs_security_intrusion',
    'meridian_security_center_attack',
    'meridian_emergency_response'
  );

-- The historical Stage 4-6 full-game activation triggers call initializers that
-- set shared definitions active. Retire those triggers; first-arrival gating
-- below is now the sole activation authority for new campaigns.
drop trigger if exists zzz_activate_meridian_customs_security_intrusion_from_full_game_v1
  on public.game_feature_activation_evidence;
drop trigger if exists zzzz_activate_meridian_security_center_attack_from_full_game_v1
  on public.game_feature_activation_evidence;
drop trigger if exists zzzzz_activate_meridian_emergency_response_from_full_game_v1
  on public.game_feature_activation_evidence;

-- Preserve the existing sponsor follow-up trigger, but make it release-aware.
-- Grandfathered games must not receive 6h/24h messages suddenly if their first
-- player arrival occurs long after the old story clock began.
create or replace function public.enable_relationship_followups_after_arrival_contact_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.effect_type = 'character_message'
    and coalesce(new.payload -> 'payload' ->> 'phase', '') = 'arrival'
  then
    if exists (
      select 1
      from public.game_session_story_flags as flag_row
      where flag_row.game_session_id = new.game_session_id
        and flag_row.flag_key = 'meridian_arrival_clock_mode_v1'
        and flag_row.value = to_jsonb('grandfathered'::text)
    ) then
      return new;
    end if;

    insert into public.game_session_story_event_overrides (
      game_session_id,
      storyline_event_id,
      enabled,
      source_player_story_impact_id,
      enabled_at,
      updated_at
    )
    select
      new.game_session_id,
      event_row.id,
      true,
      new.id,
      coalesce(new.created_at, now()),
      coalesce(new.created_at, now())
    from public.storyline_events as event_row
    join public.storylines as storyline_row
      on storyline_row.id = event_row.storyline_id
    where lower(storyline_row.key) = lower('econovaria_demo_act_1')
      and not event_row.is_active
      and (
        event_row.event_key like 'relationship_%_sponsor_followup'
        or event_row.event_key like 'meridian_fracture_%_sponsor_reaction'
      )
    on conflict (game_session_id, storyline_event_id) do update
    set enabled = true,
        source_player_story_impact_id = excluded.source_player_story_impact_id,
        enabled_at = least(
          public.game_session_story_event_overrides.enabled_at,
          excluded.enabled_at
        ),
        updated_at = excluded.updated_at;
  end if;

  return new;
end;
$function$;

-- First-arrival cutover for newly-created campaigns. The activation row is
-- locked before prior-arrival detection so concurrent first joins cannot race
-- two independent clock resets.
create or replace function public.enable_meridian_campaign_continuation_after_arrival_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_activation_id uuid;
  v_has_prior_arrival boolean := false;
  v_anchor_at timestamptz := coalesce(new.created_at, now());
begin
  if new.effect_type <> 'character_message'
    or coalesce(new.payload -> 'payload' ->> 'phase', '') <> 'arrival'
  then
    return new;
  end if;

  if exists (
    select 1
    from public.game_session_story_flags as flag_row
    where flag_row.game_session_id = new.game_session_id
      and flag_row.flag_key = 'meridian_arrival_clock_mode_v1'
      and flag_row.value = to_jsonb('grandfathered'::text)
  ) then
    return new;
  end if;

  select activation.id
  into v_activation_id
  from public.game_session_storylines as activation
  join public.storylines as storyline
    on storyline.id = activation.storyline_id
  where activation.game_session_id = new.game_session_id
    and activation.status in ('active', 'paused')
    and lower(storyline.key) = lower('econovaria_demo_act_1')
  limit 1
  for update of activation;

  if v_activation_id is null then
    return new;
  end if;

  select exists (
    select 1
    from public.player_story_impacts as prior
    where prior.game_session_id = new.game_session_id
      and prior.id <> new.id
      and prior.effect_type = 'character_message'
      and coalesce(prior.payload -> 'payload' ->> 'phase', '') = 'arrival'
  )
  into v_has_prior_arrival;

  if v_has_prior_arrival then
    return new;
  end if;

  update public.game_session_storylines
  set story_started_at = v_anchor_at,
      accumulated_pause_seconds = 0,
      paused_at = case when status = 'paused' then v_anchor_at else null end
  where id = v_activation_id;

  insert into public.game_session_story_flags (
    game_session_id,
    flag_key,
    value,
    source_story_event_id,
    created_at
  ) values (
    new.game_session_id,
    'meridian_arrival_clock_mode_v1',
    to_jsonb('arrival_anchored'::text),
    new.storyline_event_id,
    v_anchor_at
  )
  on conflict (game_session_id, flag_key) do update
  set value = excluded.value,
      source_story_event_id = excluded.source_story_event_id;

  -- Ensure every reusable definition exists. Stage 4-6 legacy initializers set
  -- their shared rows active, so all continuation keys are forced dormant again
  -- in this same transaction before the game-scoped overrides are written.
  perform public.initialize_meridian_customs_security_intrusion_v1(new.game_session_id);
  perform public.initialize_meridian_security_center_attack_v1(new.game_session_id);
  perform public.initialize_meridian_emergency_response_v1(new.game_session_id);
  perform public.initialize_meridian_competing_models_v1(new.game_session_id);
  perform public.initialize_meridian_outbreak_of_war_v1(new.game_session_id);
  perform public.initialize_meridian_fortune_during_war_v1(new.game_session_id);
  perform public.initialize_meridian_question_of_belonging_v1(new.game_session_id);
  perform public.initialize_meridian_reckoning_v1(new.game_session_id);
  perform public.initialize_meridian_local_friend_relationships_v1(new.game_session_id);

  update public.storyline_events as event_row
  set is_active = false
  from public.storylines as storyline
  where storyline.id = event_row.storyline_id
    and lower(storyline.key) = lower('econovaria_demo_act_1')
    and event_row.event_key in (
      'meridian_competing_models',
      'meridian_competing_models_recommendation_followup',
      'meridian_customs_security_intrusion',
      'meridian_security_center_attack',
      'meridian_emergency_response',
      'meridian_outbreak_of_war',
      'meridian_fortune_during_war',
      'meridian_question_of_belonging',
      'meridian_reckoning',
      'meridian_local_friend_introductions',
      'meridian_local_friend_fracture_reactions',
      'meridian_local_friend_wartime_reactions',
      'meridian_local_friend_belonging_reactions'
    );

  insert into public.game_session_story_event_overrides (
    game_session_id,
    storyline_event_id,
    enabled,
    source_player_story_impact_id,
    enabled_at,
    updated_at
  )
  select
    new.game_session_id,
    event_row.id,
    true,
    new.id,
    v_anchor_at,
    v_anchor_at
  from public.storyline_events as event_row
  join public.storylines as storyline
    on storyline.id = event_row.storyline_id
  where lower(storyline.key) = lower('econovaria_demo_act_1')
    and not event_row.is_active
    and event_row.event_key in (
      'meridian_competing_models',
      'meridian_competing_models_recommendation_followup',
      'meridian_customs_security_intrusion',
      'meridian_security_center_attack',
      'meridian_emergency_response',
      'meridian_outbreak_of_war',
      'meridian_fortune_during_war',
      'meridian_question_of_belonging',
      'meridian_reckoning',
      'meridian_local_friend_introductions',
      'meridian_local_friend_fracture_reactions',
      'meridian_local_friend_wartime_reactions',
      'meridian_local_friend_belonging_reactions'
    )
  on conflict (game_session_id, storyline_event_id) do update
  set enabled = true,
      source_player_story_impact_id = excluded.source_player_story_impact_id,
      enabled_at = least(
        public.game_session_story_event_overrides.enabled_at,
        excluded.enabled_at
      ),
      updated_at = excluded.updated_at;

  return new;
end;
$function$;

drop trigger if exists enable_meridian_campaign_continuation_after_arrival_v1
  on public.player_story_impacts;
create trigger enable_meridian_campaign_continuation_after_arrival_v1
after insert on public.player_story_impacts
for each row
when (new.effect_type = 'character_message')
execute function public.enable_meridian_campaign_continuation_after_arrival_v1();

revoke all on function public.enable_relationship_followups_after_arrival_contact_v1()
  from public, anon, authenticated;
revoke all on function public.enable_meridian_campaign_continuation_after_arrival_v1()
  from public, anon, authenticated;

comment on function public.enable_meridian_campaign_continuation_after_arrival_v1() is
  'Anchors a newly-created Meridian campaign to its first arrival Story impact, then enables the complete elapsed-time continuation only through game-scoped overrides. Pre-cutover campaigns are grandfathered and never rebased or backfilled.';
comment on function public.enable_relationship_followups_after_arrival_contact_v1() is
  'Enables sponsor follow-up and fracture messages after arrival only for arrival-anchored campaigns. Pre-cutover grandfathered games are intentionally left on their existing narrative timeline.';

commit;
