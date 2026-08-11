begin;

create table if not exists public.game_session_story_event_overrides (
  game_session_id uuid not null
    references public.game_sessions(id) on delete cascade,
  storyline_event_id uuid not null
    references public.storyline_events(id) on delete cascade,
  enabled boolean not null default true,
  source_player_story_impact_id uuid null
    references public.player_story_impacts(id) on delete set null,
  enabled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_session_id, storyline_event_id)
);

create index if not exists game_session_story_event_overrides_enabled_idx
  on public.game_session_story_event_overrides
    (game_session_id, enabled, storyline_event_id);
create index if not exists game_session_story_event_overrides_event_idx
  on public.game_session_story_event_overrides (storyline_event_id);
create index if not exists game_session_story_event_overrides_source_impact_idx
  on public.game_session_story_event_overrides (source_player_story_impact_id)
  where source_player_story_impact_id is not null;

alter table public.game_session_story_event_overrides enable row level security;
alter table public.game_session_story_event_overrides force row level security;
revoke all on table public.game_session_story_event_overrides
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.game_session_story_event_overrides
  to service_role;

-- Remove the superseded design if this migration is replayed over an earlier
-- development database. Per-game progress must never toggle shared definitions.
drop trigger if exists zzz_defer_relationship_followups_after_full_game_activation_v1
  on public.game_feature_activation_evidence;
drop function if exists public.defer_relationship_followups_after_full_game_activation_v1();

-- Ensure the reusable definitions exist for games that were already active or
-- already received an arrival contact before this migration was applied. The
-- initializer is authoritative for content and always leaves the definitions
-- globally dormant.
do $seed_existing_games$
declare
  v_game_session_id uuid;
begin
  for v_game_session_id in
    select distinct source.game_session_id
    from (
      select activation.game_session_id
      from public.game_feature_activation_evidence as activation
      where activation.story_status = 'active'
      union
      select impact.game_session_id
      from public.player_story_impacts as impact
      where impact.effect_type = 'character_message'
        and coalesce(impact.payload -> 'payload' ->> 'phase', '') = 'arrival'
    ) as source
  loop
    perform public.initialize_relationship_followups_and_meridian_fracture_v1(
      v_game_session_id
    );
  end loop;
end;
$seed_existing_games$;

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

drop trigger if exists enable_relationship_followups_after_arrival_contact_v1
  on public.player_story_impacts;
create trigger enable_relationship_followups_after_arrival_contact_v1
after insert on public.player_story_impacts
for each row
when (new.effect_type = 'character_message')
execute function public.enable_relationship_followups_after_arrival_contact_v1();

-- Backfill game-scoped enablement for arrival contacts that predate this
-- migration. One earliest arrival impact is retained as provenance per game.
insert into public.game_session_story_event_overrides (
  game_session_id,
  storyline_event_id,
  enabled,
  source_player_story_impact_id,
  enabled_at,
  updated_at
)
select
  arrival.game_session_id,
  event_row.id,
  true,
  arrival.id,
  arrival.created_at,
  now()
from (
  select distinct on (impact.game_session_id)
    impact.id,
    impact.game_session_id,
    impact.created_at
  from public.player_story_impacts as impact
  where impact.effect_type = 'character_message'
    and coalesce(impact.payload -> 'payload' ->> 'phase', '') = 'arrival'
  order by impact.game_session_id, impact.created_at asc, impact.id asc
) as arrival
join public.storyline_events as event_row
  on not event_row.is_active
join public.storylines as storyline_row
  on storyline_row.id = event_row.storyline_id
 and lower(storyline_row.key) = lower('econovaria_demo_act_1')
where event_row.event_key like 'relationship_%_sponsor_followup'
   or event_row.event_key like 'meridian_fracture_%_sponsor_reaction'
on conflict (game_session_id, storyline_event_id) do update
set enabled = true,
    source_player_story_impact_id = excluded.source_player_story_impact_id,
    enabled_at = least(
      public.game_session_story_event_overrides.enabled_at,
      excluded.enabled_at
    ),
    updated_at = excluded.updated_at;

comment on table public.game_session_story_event_overrides is
  'Game-scoped enablement for reusable storyline events that remain globally dormant until that game reaches the required player-story state.';
comment on function public.enable_relationship_followups_after_arrival_contact_v1() is
  'Enables relationship-aware Meridian follow-up events only for the game whose player received an arrival-character contact; shared storyline definitions remain unchanged.';

commit;
