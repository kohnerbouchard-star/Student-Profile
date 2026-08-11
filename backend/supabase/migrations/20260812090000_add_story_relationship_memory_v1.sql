begin;

create table public.player_story_relationships (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null,
  player_id uuid not null,
  character_key text not null,
  character_name text not null,
  country_code text null,
  relationship_role text not null default 'other',
  stage text not null default 'contacted',
  contact_count integer not null default 0,
  reply_count integer not null default 0,
  trust_score integer not null default 0,
  last_contacted_at timestamptz null,
  last_replied_at timestamptz null,
  memory jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_story_relationships_player_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id)
    on delete cascade,
  constraint player_story_relationships_character_key_valid
    check (length(btrim(character_key)) between 1 and 160),
  constraint player_story_relationships_character_name_valid
    check (length(btrim(character_name)) between 1 and 160),
  constraint player_story_relationships_country_code_valid
    check (country_code is null or country_code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  constraint player_story_relationships_role_valid
    check (relationship_role in ('sponsor','local_friend','rival_peer','gatekeeper','former_home','other')),
  constraint player_story_relationships_stage_valid
    check (stage in ('contacted','engaged','trusted','strained','broken')),
  constraint player_story_relationships_counts_valid
    check (contact_count >= 0 and reply_count >= 0),
  constraint player_story_relationships_trust_valid
    check (trust_score between -100 and 100),
  constraint player_story_relationships_memory_object
    check (jsonb_typeof(memory) = 'object'),
  constraint player_story_relationships_scope_unique
    unique (game_session_id, player_id, character_key)
);

create index player_story_relationships_player_stage_idx
  on public.player_story_relationships (game_session_id, player_id, stage, updated_at desc);

alter table public.player_story_relationships enable row level security;
revoke all on table public.player_story_relationships from public, anon, authenticated;
grant select, insert, update, delete on table public.player_story_relationships to service_role;

create or replace function public.record_player_story_relationship_memory_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_character_key text,
  p_character_name text,
  p_country_code text,
  p_relationship_role text,
  p_stage text,
  p_trust_delta integer default 0,
  p_memory_patch jsonb default '{}'::jsonb,
  p_recorded_at timestamptz default now()
)
returns public.player_story_relationships
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_row public.player_story_relationships%rowtype;
  v_character_key text := btrim(coalesce(p_character_key, ''));
  v_character_name text := btrim(coalesce(p_character_name, ''));
  v_country_code text := nullif(upper(btrim(coalesce(p_country_code, ''))), '');
  v_role text := coalesce(nullif(btrim(p_relationship_role), ''), 'other');
  v_stage text := coalesce(nullif(btrim(p_stage), ''), 'contacted');
begin
  if p_game_session_id is null or p_player_id is null
    or length(v_character_key) not between 1 and 160
    or length(v_character_name) not between 1 and 160
    or v_role not in ('sponsor','local_friend','rival_peer','gatekeeper','former_home','other')
    or v_stage not in ('contacted','engaged','trusted','strained','broken')
    or p_trust_delta is null or p_trust_delta not between -100 and 100
    or p_recorded_at is null
    or p_memory_patch is null or jsonb_typeof(p_memory_patch) <> 'object'
  then
    raise exception 'STORY_RELATIONSHIP_MEMORY_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.players p
    where p.game_session_id = p_game_session_id
      and p.id = p_player_id
      and p.status = 'active'
  ) then
    raise exception 'STORY_RELATIONSHIP_PLAYER_FORBIDDEN' using errcode = 'P0001';
  end if;

  insert into public.player_story_relationships (
    game_session_id, player_id, character_key, character_name, country_code,
    relationship_role, stage, trust_score, memory, updated_at
  ) values (
    p_game_session_id, p_player_id, v_character_key, v_character_name,
    v_country_code, v_role, v_stage,
    greatest(-100, least(100, p_trust_delta)), p_memory_patch, p_recorded_at
  )
  on conflict (game_session_id, player_id, character_key) do update
  set character_name = excluded.character_name,
      country_code = coalesce(excluded.country_code, public.player_story_relationships.country_code),
      relationship_role = case
        when excluded.relationship_role = 'other' then public.player_story_relationships.relationship_role
        else excluded.relationship_role
      end,
      stage = excluded.stage,
      trust_score = greatest(-100, least(100, public.player_story_relationships.trust_score + p_trust_delta)),
      memory = public.player_story_relationships.memory || excluded.memory,
      updated_at = excluded.updated_at
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function public.capture_story_relationship_contact_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text := coalesce(nullif(new.payload -> 'payload' ->> 'relationshipRole', ''), 'other');
  v_country_code text := upper(split_part(coalesce(new.payload ->> 'characterKey', ''), '.', 2));
begin
  if new.effect_type <> 'character_message' then
    return new;
  end if;

  insert into public.player_story_relationships (
    game_session_id, player_id, character_key, character_name, country_code,
    relationship_role, stage, contact_count, last_contacted_at, memory, updated_at
  ) values (
    new.game_session_id,
    new.player_id,
    new.payload ->> 'characterKey',
    new.payload ->> 'characterName',
    nullif(v_country_code, ''),
    case when v_role in ('sponsor','local_friend','rival_peer','gatekeeper','former_home') then v_role else 'other' end,
    'contacted',
    1,
    new.created_at,
    jsonb_build_object(
      'lastConversationKey', new.payload ->> 'conversationKey',
      'lastMessageTitle', new.payload ->> 'title',
      'lastStoryImpactId', new.id::text
    ),
    new.created_at
  )
  on conflict (game_session_id, player_id, character_key) do update
  set character_name = excluded.character_name,
      country_code = coalesce(excluded.country_code, public.player_story_relationships.country_code),
      relationship_role = case
        when excluded.relationship_role = 'other' then public.player_story_relationships.relationship_role
        else excluded.relationship_role
      end,
      contact_count = public.player_story_relationships.contact_count + 1,
      last_contacted_at = excluded.last_contacted_at,
      memory = public.player_story_relationships.memory || excluded.memory,
      updated_at = excluded.updated_at;

  return new;
end;
$function$;

create trigger capture_story_relationship_contact_v1
after insert on public.player_story_impacts
for each row
when (new.effect_type = 'character_message')
execute function public.capture_story_relationship_contact_v1();

create or replace function public.capture_story_relationship_reply_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_thread public.message_threads%rowtype;
begin
  if new.sender_type <> 'player' or new.sender_player_id is null then
    return new;
  end if;

  select * into v_thread
  from public.message_threads t
  where t.id = new.thread_id
    and t.game_session_id = new.game_session_id
    and t.story_character_key is not null
    and t.story_player_id = new.sender_player_id;

  if not found then
    return new;
  end if;

  update public.player_story_relationships
  set reply_count = reply_count + 1,
      stage = case when stage = 'contacted' then 'engaged' else stage end,
      last_replied_at = new.created_at,
      memory = memory || jsonb_build_object(
        'lastReplyMessageId', new.public_message_id,
        'lastReplyAt', new.created_at
      ),
      updated_at = new.created_at
  where game_session_id = new.game_session_id
    and player_id = new.sender_player_id
    and character_key = v_thread.story_character_key;

  return new;
end;
$function$;

create trigger capture_story_relationship_reply_v1
after insert on public.messages
for each row
when (new.sender_type = 'player')
execute function public.capture_story_relationship_reply_v1();

revoke all on function public.record_player_story_relationship_memory_v1(uuid, uuid, text, text, text, text, text, integer, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_player_story_relationship_memory_v1(uuid, uuid, text, text, text, text, text, integer, jsonb, timestamptz)
  to service_role;

comment on table public.player_story_relationships is
  'Durable player-scoped relationship memory for recurring Econovaria story characters. It records contact/reply history, trust state, stage, and bounded remembered decisions without exposing ownership identifiers to browsers.';

commit;
