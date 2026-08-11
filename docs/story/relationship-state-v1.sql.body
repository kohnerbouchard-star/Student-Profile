begin;

create table public.story_relationships (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  character_key text not null,
  trust smallint not null default 0,
  respect smallint not null default 0,
  affinity smallint not null default 0,
  obligation smallint not null default 0,
  suspicion smallint not null default 0,
  standing text not null default 'neutral',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_relationships_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id)
    on delete cascade,
  constraint story_relationships_character_key_valid check (
    length(character_key) between 1 and 160
    and character_key = btrim(character_key)
    and character_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    and character_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint story_relationships_metrics_bounded check (
    trust between -100 and 100
    and respect between -100 and 100
    and affinity between -100 and 100
    and obligation between -100 and 100
    and suspicion between -100 and 100
  ),
  constraint story_relationships_standing_valid check (
    standing in ('hostile','strained','neutral','trusted','allied')
  ),
  constraint story_relationships_character_unique
    unique (game_session_id, player_id, character_key)
);

create index story_relationships_player_idx
  on public.story_relationships (game_session_id, player_id, character_key);

create table public.story_relationship_adjustments (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  player_id uuid not null,
  source_storyline_event_id uuid not null references public.storyline_events(id) on delete restrict,
  effect_index integer not null,
  character_key text not null,
  reason text not null,
  deltas jsonb not null,
  before_state jsonb not null,
  after_state jsonb not null,
  content_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint story_relationship_adjustments_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id)
    on delete cascade,
  constraint story_relationship_adjustments_effect_index_valid
    check (effect_index between 0 and 10000),
  constraint story_relationship_adjustments_character_key_valid check (
    length(character_key) between 1 and 160
    and character_key = btrim(character_key)
    and character_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
  ),
  constraint story_relationship_adjustments_reason_valid check (
    length(reason) between 1 and 1000
    and reason = btrim(reason)
    and reason !~ E'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'
  ),
  constraint story_relationship_adjustments_deltas_valid check (
    jsonb_typeof(deltas) = 'object'
  ),
  constraint story_relationship_adjustments_fingerprint_valid check (
    content_fingerprint ~ '^[0-9a-f]{32}$'
  ),
  constraint story_relationship_adjustments_effect_once
    unique (game_session_id, player_id, source_storyline_event_id, effect_index)
);

create index story_relationship_adjustments_event_idx
  on public.story_relationship_adjustments
    (game_session_id, source_storyline_event_id, effect_index, player_id);

alter table public.story_relationships enable row level security;
alter table public.story_relationships force row level security;
alter table public.story_relationship_adjustments enable row level security;
alter table public.story_relationship_adjustments force row level security;

revoke all privileges on table public.story_relationships from public, anon, authenticated;
revoke all privileges on table public.story_relationship_adjustments from public, anon, authenticated;
grant select, insert, update on table public.story_relationships to service_role;
grant select, insert on table public.story_relationship_adjustments to service_role;

create or replace function public.story_relationship_standing_v1(
  p_trust integer,
  p_respect integer,
  p_affinity integer,
  p_obligation integer,
  p_suspicion integer
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when round(
      coalesce(p_trust,0) * 0.35 +
      coalesce(p_respect,0) * 0.25 +
      coalesce(p_affinity,0) * 0.20 +
      coalesce(p_obligation,0) * 0.10 -
      coalesce(p_suspicion,0) * 0.35
    ) <= -50 then 'hostile'
    when round(
      coalesce(p_trust,0) * 0.35 +
      coalesce(p_respect,0) * 0.25 +
      coalesce(p_affinity,0) * 0.20 +
      coalesce(p_obligation,0) * 0.10 -
      coalesce(p_suspicion,0) * 0.35
    ) <= -15 then 'strained'
    when round(
      coalesce(p_trust,0) * 0.35 +
      coalesce(p_respect,0) * 0.25 +
      coalesce(p_affinity,0) * 0.20 +
      coalesce(p_obligation,0) * 0.10 -
      coalesce(p_suspicion,0) * 0.35
    ) < 35 then 'neutral'
    when round(
      coalesce(p_trust,0) * 0.35 +
      coalesce(p_respect,0) * 0.25 +
      coalesce(p_affinity,0) * 0.20 +
      coalesce(p_obligation,0) * 0.10 -
      coalesce(p_suspicion,0) * 0.35
    ) < 70 then 'trusted'
    else 'allied'
  end;
$function$;

revoke all on function public.story_relationship_standing_v1(integer,integer,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.story_relationship_standing_v1(integer,integer,integer,integer,integer)
  to service_role;

create or replace function public.protect_story_relationship_adjustment_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  raise exception 'STORY_RELATIONSHIP_ADJUSTMENT_IMMUTABLE' using errcode = 'P0001';
end;
$function$;

create trigger protect_story_relationship_adjustment_v1
before update or delete on public.story_relationship_adjustments
for each row execute function public.protect_story_relationship_adjustment_v1();

create or replace function public.initialize_story_relationship_from_thread_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.story_relationships (
    game_session_id, player_id, character_key
  ) values (
    new.game_session_id, new.player_id, new.character_key
  ) on conflict (game_session_id, player_id, character_key) do nothing;
  return new;
end;
$function$;

revoke all on function public.initialize_story_relationship_from_thread_v1()
  from public, anon, authenticated;

drop trigger if exists initialize_story_relationship_from_thread_v1 on public.story_message_threads;
create trigger initialize_story_relationship_from_thread_v1
after insert on public.story_message_threads
for each row execute function public.initialize_story_relationship_from_thread_v1();

insert into public.story_relationships (
  game_session_id, player_id, character_key, created_at, updated_at
)
select
  game_session_id,
  player_id,
  character_key,
  min(created_at),
  min(created_at)
from public.story_message_threads
group by game_session_id, player_id, character_key
on conflict (game_session_id, player_id, character_key) do nothing;

create or replace function public.adjust_story_relationship_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_source_storyline_event_id uuid,
  p_effect_index integer,
  p_character_key text,
  p_reason text,
  p_deltas jsonb
)
returns table (
  adjustment_outcome text,
  relationship_id uuid,
  adjustment_id uuid,
  standing text,
  trust smallint,
  respect smallint,
  affinity smallint,
  obligation smallint,
  suspicion smallint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_relationship public.story_relationships%rowtype;
  v_adjustment public.story_relationship_adjustments%rowtype;
  v_character_key text := btrim(coalesce(p_character_key, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_trust_delta integer := 0;
  v_respect_delta integer := 0;
  v_affinity_delta integer := 0;
  v_obligation_delta integer := 0;
  v_suspicion_delta integer := 0;
  v_deltas jsonb;
  v_before jsonb;
  v_after jsonb;
  v_fingerprint text;
  v_new_trust integer;
  v_new_respect integer;
  v_new_affinity integer;
  v_new_obligation integer;
  v_new_suspicion integer;
begin
  if p_game_session_id is null
    or p_player_id is null
    or p_source_storyline_event_id is null
    or p_effect_index not between 0 and 10000
    or v_character_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    or length(v_reason) not between 1 and 1000
    or v_reason ~ E'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'
    or jsonb_typeof(p_deltas) <> 'object'
  then
    raise exception 'STORY_RELATIONSHIP_ADJUSTMENT_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_deltas) as delta_key
    where delta_key not in ('trust','respect','affinity','obligation','suspicion')
  ) or exists (
    select 1
    from jsonb_each(p_deltas) as delta_entry
    where jsonb_typeof(delta_entry.value) <> 'number'
      or delta_entry.value::text !~ '^-?[0-9]+$'
      or (delta_entry.value::text)::integer not between -100 and 100
  ) then
    raise exception 'STORY_RELATIONSHIP_ADJUSTMENT_INVALID' using errcode = 'P0001';
  end if;

  v_trust_delta := coalesce((p_deltas ->> 'trust')::integer, 0);
  v_respect_delta := coalesce((p_deltas ->> 'respect')::integer, 0);
  v_affinity_delta := coalesce((p_deltas ->> 'affinity')::integer, 0);
  v_obligation_delta := coalesce((p_deltas ->> 'obligation')::integer, 0);
  v_suspicion_delta := coalesce((p_deltas ->> 'suspicion')::integer, 0);

  if v_trust_delta = 0 and v_respect_delta = 0 and v_affinity_delta = 0
    and v_obligation_delta = 0 and v_suspicion_delta = 0
  then
    raise exception 'STORY_RELATIONSHIP_ADJUSTMENT_EMPTY' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.storyline_events
    where id = p_source_storyline_event_id
      and game_session_id = p_game_session_id
  ) then
    raise exception 'STORY_RELATIONSHIP_EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.players
    where id = p_player_id
      and game_session_id = p_game_session_id
      and status = 'active'
  ) then
    raise exception 'STORY_RELATIONSHIP_PLAYER_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  v_deltas := jsonb_strip_nulls(jsonb_build_object(
    'trust', nullif(v_trust_delta, 0),
    'respect', nullif(v_respect_delta, 0),
    'affinity', nullif(v_affinity_delta, 0),
    'obligation', nullif(v_obligation_delta, 0),
    'suspicion', nullif(v_suspicion_delta, 0)
  ));
  v_fingerprint := md5(
    p_game_session_id::text || '|' || p_player_id::text || '|' ||
    p_source_storyline_event_id::text || '|' || p_effect_index::text || '|' ||
    v_character_key || '|' || v_reason || '|' || v_deltas::text
  );

  select * into v_adjustment
  from public.story_relationship_adjustments
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and source_storyline_event_id = p_source_storyline_event_id
    and effect_index = p_effect_index;

  if found then
    if v_adjustment.character_key <> v_character_key
      or v_adjustment.content_fingerprint <> v_fingerprint
    then
      raise exception 'STORY_RELATIONSHIP_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    select * into v_relationship
    from public.story_relationships
    where game_session_id = p_game_session_id
      and player_id = p_player_id
      and character_key = v_character_key;
    return query select
      'replayed'::text,
      v_relationship.id,
      v_adjustment.id,
      v_relationship.standing,
      v_relationship.trust,
      v_relationship.respect,
      v_relationship.affinity,
      v_relationship.obligation,
      v_relationship.suspicion,
      v_relationship.updated_at;
    return;
  end if;

  insert into public.story_relationships (
    game_session_id, player_id, character_key
  ) values (
    p_game_session_id, p_player_id, v_character_key
  ) on conflict (game_session_id, player_id, character_key) do nothing;

  select * into v_relationship
  from public.story_relationships
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and character_key = v_character_key
  for update;

  v_before := jsonb_build_object(
    'trust', v_relationship.trust,
    'respect', v_relationship.respect,
    'affinity', v_relationship.affinity,
    'obligation', v_relationship.obligation,
    'suspicion', v_relationship.suspicion,
    'standing', v_relationship.standing
  );

  v_new_trust := greatest(-100, least(100, v_relationship.trust + v_trust_delta));
  v_new_respect := greatest(-100, least(100, v_relationship.respect + v_respect_delta));
  v_new_affinity := greatest(-100, least(100, v_relationship.affinity + v_affinity_delta));
  v_new_obligation := greatest(-100, least(100, v_relationship.obligation + v_obligation_delta));
  v_new_suspicion := greatest(-100, least(100, v_relationship.suspicion + v_suspicion_delta));

  update public.story_relationships
  set
    trust = v_new_trust,
    respect = v_new_respect,
    affinity = v_new_affinity,
    obligation = v_new_obligation,
    suspicion = v_new_suspicion,
    standing = public.story_relationship_standing_v1(
      v_new_trust,
      v_new_respect,
      v_new_affinity,
      v_new_obligation,
      v_new_suspicion
    ),
    updated_at = now()
  where id = v_relationship.id
  returning * into v_relationship;

  v_after := jsonb_build_object(
    'trust', v_relationship.trust,
    'respect', v_relationship.respect,
    'affinity', v_relationship.affinity,
    'obligation', v_relationship.obligation,
    'suspicion', v_relationship.suspicion,
    'standing', v_relationship.standing
  );

  insert into public.story_relationship_adjustments (
    game_session_id,
    player_id,
    source_storyline_event_id,
    effect_index,
    character_key,
    reason,
    deltas,
    before_state,
    after_state,
    content_fingerprint
  ) values (
    p_game_session_id,
    p_player_id,
    p_source_storyline_event_id,
    p_effect_index,
    v_character_key,
    v_reason,
    v_deltas,
    v_before,
    v_after,
    v_fingerprint
  ) returning * into v_adjustment;

  return query select
    'applied'::text,
    v_relationship.id,
    v_adjustment.id,
    v_relationship.standing,
    v_relationship.trust,
    v_relationship.respect,
    v_relationship.affinity,
    v_relationship.obligation,
    v_relationship.suspicion,
    v_relationship.updated_at;
end;
$function$;

revoke all on function public.adjust_story_relationship_v1(uuid,uuid,uuid,integer,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.adjust_story_relationship_v1(uuid,uuid,uuid,integer,text,text,jsonb)
  to service_role;

commit;
