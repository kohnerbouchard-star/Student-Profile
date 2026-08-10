begin;

-- Story character conversations extend Messaging without duplicating inbox,
-- read-receipt, retention, moderation, or public-ID authority.
alter table public.message_threads
  drop constraint message_threads_type_valid,
  add constraint message_threads_type_valid check (
    thread_type in ('announcement', 'system', 'player', 'contract', 'story')
  ),
  drop constraint message_threads_reply_policy_valid,
  add constraint message_threads_reply_policy_valid check (
    (thread_type in ('announcement', 'system', 'story') and allow_player_replies = false)
    or thread_type in ('player', 'contract')
  ),
  add constraint message_threads_story_system_only check (
    thread_type <> 'story'
    or (
      created_by_type = 'system'
      and created_by_staff_user_id is null
      and created_by_player_id is null
      and allow_player_replies = false
      and contract_key is null
    )
  );

create table public.story_message_threads (
  thread_id uuid primary key,
  game_session_id uuid not null,
  player_id uuid not null,
  character_key text not null,
  character_name text not null,
  created_at timestamptz not null default now(),
  constraint story_message_threads_thread_scope_fk
    foreign key (game_session_id, thread_id)
    references public.message_threads(game_session_id, id)
    on delete cascade,
  constraint story_message_threads_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id)
    on delete cascade,
  constraint story_message_threads_character_key_valid check (
    length(btrim(character_key)) between 1 and 160
    and character_key = btrim(character_key)
    and character_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    and character_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint story_message_threads_character_name_valid check (
    length(btrim(character_name)) between 1 and 160
    and character_name = btrim(character_name)
    and character_name !~ '[[:cntrl:]]'
  ),
  constraint story_message_threads_unique_character
    unique (game_session_id, player_id, character_key),
  constraint story_message_threads_scope_unique
    unique (game_session_id, thread_id)
);

create index story_message_threads_game_player_idx
  on public.story_message_threads (game_session_id, player_id, created_at desc);

create table public.story_messages (
  message_id uuid primary key,
  game_session_id uuid not null,
  thread_id uuid not null,
  player_id uuid not null,
  source_storyline_event_id uuid not null,
  effect_index integer not null,
  interaction_key text null,
  message_purpose text not null,
  idempotency_key text not null,
  idempotency_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint story_messages_message_scope_fk
    foreign key (game_session_id, message_id)
    references public.messages(game_session_id, id)
    on delete cascade,
  constraint story_messages_thread_scope_fk
    foreign key (game_session_id, thread_id)
    references public.story_message_threads(game_session_id, thread_id)
    on delete cascade,
  constraint story_messages_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id)
    on delete cascade,
  constraint story_messages_event_fk
    foreign key (source_storyline_event_id)
    references public.storyline_events(id)
    on delete restrict,
  constraint story_messages_effect_index_valid check (effect_index between 0 and 10000),
  constraint story_messages_interaction_key_valid check (
    interaction_key is null
    or (
      length(interaction_key) between 1 and 160
      and interaction_key = btrim(interaction_key)
      and interaction_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
      and interaction_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  ),
  constraint story_messages_purpose_valid check (
    message_purpose in (
      'relationship',
      'briefing',
      'warning',
      'request',
      'offer',
      'follow_up',
      'crisis',
      'reflection'
    )
  ),
  constraint story_messages_idempotency_key_valid check (
    length(idempotency_key) between 1 and 128
    and idempotency_key = btrim(idempotency_key)
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  constraint story_messages_fingerprint_valid check (
    idempotency_fingerprint ~ '^[0-9a-f]{32}$'
  ),
  constraint story_messages_effect_once
    unique (game_session_id, player_id, source_storyline_event_id, effect_index),
  constraint story_messages_scope_unique
    unique (game_session_id, message_id)
);

create index story_messages_game_player_created_idx
  on public.story_messages (game_session_id, player_id, created_at desc);
create index story_messages_event_idx
  on public.story_messages (source_storyline_event_id, effect_index);

alter table public.story_message_threads enable row level security;
alter table public.story_message_threads force row level security;
alter table public.story_messages enable row level security;
alter table public.story_messages force row level security;

revoke all privileges on table public.story_message_threads from public, anon, authenticated;
revoke all privileges on table public.story_messages from public, anon, authenticated;
grant select, insert, delete on table public.story_message_threads to service_role;
grant select, insert, delete on table public.story_messages to service_role;

create or replace function public.validate_story_message_thread_extension_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_thread public.message_threads%rowtype;
  v_participant_count integer;
  v_matching_count integer;
begin
  select thread_row.*
  into v_thread
  from public.message_threads as thread_row
  where thread_row.game_session_id = new.game_session_id
    and thread_row.id = new.thread_id;

  if not found
    or v_thread.thread_type <> 'story'
    or v_thread.created_by_type <> 'system'
    or v_thread.created_by_staff_user_id is not null
    or v_thread.created_by_player_id is not null
    or v_thread.allow_player_replies
    or v_thread.contract_key is not null
    or v_thread.title <> new.character_name
  then
    raise exception 'STORY_MESSAGE_THREAD_INVALID' using errcode = 'P0001';
  end if;

  select
    count(*)::integer,
    count(*) filter (where participant_row.player_id = new.player_id)::integer
  into v_participant_count, v_matching_count
  from public.message_thread_participants as participant_row
  where participant_row.game_session_id = new.game_session_id
    and participant_row.thread_id = new.thread_id;

  if v_participant_count <> 1 or v_matching_count <> 1 then
    raise exception 'STORY_MESSAGE_THREAD_PARTICIPANTS_INVALID' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

create trigger validate_story_message_thread_extension_v1
before insert or update on public.story_message_threads
for each row execute function public.validate_story_message_thread_extension_v1();

create or replace function public.protect_story_message_thread_core_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if old.thread_type = 'story' or exists (
    select 1
    from public.story_message_threads as story_thread
    where story_thread.game_session_id = old.game_session_id
      and story_thread.thread_id = old.id
  ) then
    if new.game_session_id is distinct from old.game_session_id
      or new.thread_type is distinct from old.thread_type
      or new.title is distinct from old.title
      or new.contract_key is distinct from old.contract_key
      or new.allow_player_replies is distinct from old.allow_player_replies
      or new.created_by_type is distinct from old.created_by_type
      or new.created_by_staff_user_id is distinct from old.created_by_staff_user_id
      or new.created_by_player_id is distinct from old.created_by_player_id
      or new.created_at is distinct from old.created_at
    then
      raise exception 'STORY_MESSAGE_THREAD_CORE_IMMUTABLE' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;

create trigger protect_story_message_thread_core_v1
before update on public.message_threads
for each row execute function public.protect_story_message_thread_core_v1();

create or replace function public.protect_story_message_participants_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_old_player_id uuid;
  v_new_player_id uuid;
begin
  if tg_op = 'DELETE' then
    select story_thread.player_id
    into v_old_player_id
    from public.story_message_threads as story_thread
    where story_thread.game_session_id = old.game_session_id
      and story_thread.thread_id = old.thread_id;

    if found and pg_trigger_depth() = 1 then
      raise exception 'STORY_MESSAGE_PARTICIPANTS_IMMUTABLE' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    select story_thread.player_id
    into v_old_player_id
    from public.story_message_threads as story_thread
    where story_thread.game_session_id = old.game_session_id
      and story_thread.thread_id = old.thread_id;

    if found and (
      new.game_session_id is distinct from old.game_session_id
      or new.thread_id is distinct from old.thread_id
      or new.player_id is distinct from old.player_id
      or new.player_id <> v_old_player_id
    ) then
      raise exception 'STORY_MESSAGE_PARTICIPANTS_IMMUTABLE' using errcode = 'P0001';
    end if;
  end if;

  select story_thread.player_id
  into v_new_player_id
  from public.story_message_threads as story_thread
  where story_thread.game_session_id = new.game_session_id
    and story_thread.thread_id = new.thread_id;

  if found and new.player_id <> v_new_player_id then
    raise exception 'STORY_MESSAGE_PARTICIPANTS_IMMUTABLE' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

create trigger protect_story_message_participants_v1
before insert or update or delete on public.message_thread_participants
for each row execute function public.protect_story_message_participants_v1();

create or replace function public.validate_story_message_extension_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_message public.messages%rowtype;
  v_story_thread public.story_message_threads%rowtype;
begin
  select message_row.*
  into v_message
  from public.messages as message_row
  where message_row.game_session_id = new.game_session_id
    and message_row.id = new.message_id;

  select story_thread.*
  into v_story_thread
  from public.story_message_threads as story_thread
  where story_thread.game_session_id = new.game_session_id
    and story_thread.thread_id = new.thread_id;

  if not found
    or v_message.id is null
    or v_message.thread_id <> new.thread_id
    or v_message.sender_type <> 'system'
    or v_message.sender_player_id is not null
    or v_message.sender_staff_user_id is not null
    or v_story_thread.player_id <> new.player_id
  then
    raise exception 'STORY_MESSAGE_EXTENSION_INVALID' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

create trigger validate_story_message_extension_v1
before insert or update on public.story_messages
for each row execute function public.validate_story_message_extension_v1();

create or replace function public.deliver_story_character_message_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_storyline_event_id uuid,
  p_effect_index integer,
  p_character_key text,
  p_character_name text,
  p_interaction_key text,
  p_message_purpose text,
  p_body text
)
returns table (
  delivery_outcome text,
  thread_id text,
  message_id text,
  character_key text,
  character_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_character_key text := btrim(coalesce(p_character_key, ''));
  v_character_name text := btrim(coalesce(p_character_name, ''));
  v_interaction_key text := nullif(btrim(coalesce(p_interaction_key, '')), '');
  v_purpose text := lower(btrim(coalesce(p_message_purpose, '')));
  v_body text := btrim(coalesce(p_body, ''));
  v_storyline_key text;
  v_event_key text;
  v_fingerprint text;
  v_message_key text;
  v_retention_days integer := 365;
  v_thread public.message_threads%rowtype;
  v_story_thread public.story_message_threads%rowtype;
  v_message public.messages%rowtype;
  v_story_message public.story_messages%rowtype;
  v_notification_id uuid;
begin
  if p_game_session_id is null
    or p_player_id is null
    or p_storyline_event_id is null
    or p_effect_index is null or p_effect_index not between 0 and 10000
    or length(v_character_key) not between 1 and 160
    or v_character_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    or v_character_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or length(v_character_name) not between 1 and 160
    or v_character_name ~ '[[:cntrl:]]'
    or (
      v_interaction_key is not null
      and (
        length(v_interaction_key) > 160
        or v_interaction_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
        or v_interaction_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
    or v_purpose not in (
      'relationship', 'briefing', 'warning', 'request',
      'offer', 'follow_up', 'crisis', 'reflection'
    )
    or length(v_body) not between 1 and 1000
    or v_body ~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
  then
    raise exception 'STORY_CHARACTER_MESSAGE_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.status = 'active'
  ) then
    raise exception 'STORY_CHARACTER_MESSAGE_GAME_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
  for update;
  if not found then
    raise exception 'STORY_CHARACTER_MESSAGE_PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  select storyline_row.key, event_row.event_key
  into v_storyline_key, v_event_key
  from public.storyline_events as event_row
  join public.storylines as storyline_row
    on storyline_row.id = event_row.storyline_id
  join public.game_session_storylines as activation_row
    on activation_row.game_session_id = p_game_session_id
    and activation_row.storyline_id = event_row.storyline_id
  where event_row.id = p_storyline_event_id
    and event_row.is_active = true
    and storyline_row.is_active = true
    and activation_row.status = 'active';

  if not found then
    raise exception 'STORY_CHARACTER_MESSAGE_EVENT_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  v_fingerprint := md5(
    p_player_id::text || chr(31) ||
    p_storyline_event_id::text || chr(31) ||
    p_effect_index::text || chr(31) ||
    v_character_key || chr(31) ||
    v_character_name || chr(31) ||
    coalesce(v_interaction_key, '') || chr(31) ||
    v_purpose || chr(31) ||
    v_body
  );

  select story_message.*
  into v_story_message
  from public.story_messages as story_message
  where story_message.game_session_id = p_game_session_id
    and story_message.player_id = p_player_id
    and story_message.source_storyline_event_id = p_storyline_event_id
    and story_message.effect_index = p_effect_index
  for update;

  if found then
    select message_row.*
    into v_message
    from public.messages as message_row
    where message_row.game_session_id = p_game_session_id
      and message_row.id = v_story_message.message_id;

    select story_thread.*
    into v_story_thread
    from public.story_message_threads as story_thread
    where story_thread.game_session_id = p_game_session_id
      and story_thread.thread_id = v_story_message.thread_id;

    select thread_row.*
    into v_thread
    from public.message_threads as thread_row
    where thread_row.game_session_id = p_game_session_id
      and thread_row.id = v_story_message.thread_id;

    if v_story_message.idempotency_fingerprint <> v_fingerprint
      or v_message.body <> v_body
      or v_story_thread.character_key <> v_character_key
      or v_story_thread.character_name <> v_character_name
      or v_story_message.interaction_key is distinct from v_interaction_key
      or v_story_message.message_purpose <> v_purpose
    then
      raise exception 'STORY_CHARACTER_MESSAGE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    return query
    select
      'replayed'::text,
      v_thread.public_thread_id,
      v_message.public_message_id,
      v_story_thread.character_key,
      v_story_thread.character_name,
      v_message.created_at;
    return;
  end if;

  select story_thread.*
  into v_story_thread
  from public.story_message_threads as story_thread
  where story_thread.game_session_id = p_game_session_id
    and story_thread.player_id = p_player_id
    and story_thread.character_key = v_character_key
  for update;

  if found then
    if v_story_thread.character_name <> v_character_name then
      raise exception 'STORY_CHARACTER_IDENTITY_CONFLICT' using errcode = 'P0001';
    end if;

    select thread_row.*
    into v_thread
    from public.message_threads as thread_row
    where thread_row.game_session_id = p_game_session_id
      and thread_row.id = v_story_thread.thread_id
    for update;

    if not found
      or v_thread.thread_type <> 'story'
      or v_thread.status <> 'active'
      or v_thread.retention_until <= now()
      or v_thread.allow_player_replies
    then
      raise exception 'STORY_CHARACTER_MESSAGE_THREAD_LOCKED' using errcode = 'P0001';
    end if;
  else
    select coalesce(policy_row.default_retention_days, 365)
    into v_retention_days
    from public.message_game_policies as policy_row
    where policy_row.game_session_id = p_game_session_id;

    v_retention_days := coalesce(v_retention_days, 365);

    insert into public.message_threads (
      game_session_id,
      thread_type,
      title,
      contract_key,
      allow_player_replies,
      status,
      retention_until,
      created_by_type,
      created_by_staff_user_id,
      created_by_player_id
    ) values (
      p_game_session_id,
      'story',
      v_character_name,
      null,
      false,
      'active',
      now() + make_interval(days => v_retention_days),
      'system',
      null,
      null
    ) returning * into v_thread;

    insert into public.message_thread_participants (
      thread_id, game_session_id, player_id, joined_at, last_read_at
    ) values (
      v_thread.id, p_game_session_id, p_player_id, now(), null
    );

    insert into public.story_message_threads (
      thread_id, game_session_id, player_id, character_key, character_name
    ) values (
      v_thread.id, p_game_session_id, p_player_id, v_character_key, v_character_name
    ) returning * into v_story_thread;
  end if;

  v_message_key := 'story_msg:'
    || replace(p_storyline_event_id::text, '-', '')
    || ':' || p_effect_index::text
    || ':' || replace(p_player_id::text, '-', '');

  if length(v_message_key) > 128 then
    raise exception 'STORY_CHARACTER_MESSAGE_KEY_OVERFLOW' using errcode = 'P0001';
  end if;

  insert into public.messages (
    thread_id,
    game_session_id,
    sender_type,
    sender_player_id,
    sender_staff_user_id,
    body,
    idempotency_key
  ) values (
    v_thread.id,
    p_game_session_id,
    'system',
    null,
    null,
    v_body,
    v_message_key
  ) returning * into v_message;

  insert into public.story_messages (
    message_id,
    game_session_id,
    thread_id,
    player_id,
    source_storyline_event_id,
    effect_index,
    interaction_key,
    message_purpose,
    idempotency_key,
    idempotency_fingerprint,
    created_at
  ) values (
    v_message.id,
    p_game_session_id,
    v_thread.id,
    p_player_id,
    p_storyline_event_id,
    p_effect_index,
    v_interaction_key,
    v_purpose,
    v_message_key,
    v_fingerprint,
    v_message.created_at
  );

  update public.message_threads
  set updated_at = v_message.created_at
  where game_session_id = p_game_session_id
    and id = v_thread.id;

  insert into public.notifications (
    game_session_id,
    source_type,
    source_id,
    notification_type,
    title,
    summary,
    priority,
    display_mode,
    payload,
    published_at
  ) values (
    p_game_session_id,
    'message',
    v_message.public_message_id,
    'message_received',
    v_character_name,
    'New message from ' || v_character_name || '.',
    'normal',
    'inbox',
    jsonb_build_object(
      'threadId', v_thread.public_thread_id,
      'messageId', v_message.public_message_id,
      'characterKey', v_character_key,
      'storylineKey', v_storyline_key,
      'storyEventKey', v_event_key,
      'messagePurpose', v_purpose
    ),
    v_message.created_at
  ) returning id into v_notification_id;

  insert into public.notification_deliveries (
    notification_id, game_session_id, player_id, delivered_at
  ) values (
    v_notification_id, p_game_session_id, p_player_id, v_message.created_at
  ) on conflict (notification_id, player_id) do nothing;

  return query
  select
    'applied'::text,
    v_thread.public_thread_id,
    v_message.public_message_id,
    v_story_thread.character_key,
    v_story_thread.character_name,
    v_message.created_at;
end;
$function$;

create or replace function public.private_player_message_thread_payload_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_thread_id uuid,
  p_joined_at timestamptz,
  p_last_read_at timestamptz,
  p_message_limit integer
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'id', thread_row.public_thread_id,
    'type', thread_row.thread_type,
    'title', thread_row.title,
    'contractKey', thread_row.contract_key,
    'storyCharacterKey', story_thread.character_key,
    'storyCharacterName', story_thread.character_name,
    'status', thread_row.status,
    'allowPlayerReplies', thread_row.allow_player_replies,
    'participantCount', participant_values.participant_count,
    'unreadCount', unread_values.unread_count,
    'updatedAt', thread_row.updated_at,
    'retentionUntil', thread_row.retention_until,
    'messages', message_values.messages
  )
  from public.message_threads as thread_row
  left join public.story_message_threads as story_thread
    on story_thread.game_session_id = thread_row.game_session_id
    and story_thread.thread_id = thread_row.id
  cross join lateral (
    select count(*)::integer as participant_count
    from public.message_thread_participants as participant_count_row
    where participant_count_row.game_session_id = p_game_session_id
      and participant_count_row.thread_id = p_thread_id
  ) as participant_values
  cross join lateral (
    select count(*)::integer as unread_count
    from public.messages as unread_message
    where unread_message.game_session_id = p_game_session_id
      and unread_message.thread_id = p_thread_id
      and unread_message.hidden_at is null
      and unread_message.sender_player_id is distinct from p_player_id
      and unread_message.created_at > coalesce(p_last_read_at, p_joined_at)
  ) as unread_values
  cross join lateral (
    select coalesce(
      jsonb_agg(
        message_payload.payload
        order by message_payload.created_at asc, message_payload.public_message_id asc
      ),
      '[]'::jsonb
    ) as messages
    from (
      select
        message_row.created_at,
        message_row.public_message_id,
        jsonb_build_object(
          'id', message_row.public_message_id,
          'senderType', message_row.sender_type,
          'senderName', case
            when story_message.message_id is not null then story_thread.character_name
            when message_row.sender_type = 'player' then coalesce(player_sender.display_name, 'Player')
            when message_row.sender_type = 'staff_user' then coalesce(staff_sender.display_name, 'Administrator')
            else 'System'
          end,
          'senderReference', case
            when message_row.sender_type = 'player'
              and player_sender.player_identifier is not null
              and player_sender.player_identifier !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then player_sender.player_identifier
            else null
          end,
          'senderCharacterKey', case
            when story_message.message_id is not null then story_thread.character_key
            else null
          end,
          'storylineKey', case when message_row.hidden_at is null then storyline_row.key else null end,
          'storyEventKey', case when message_row.hidden_at is null then story_event.event_key else null end,
          'interactionKey', case when message_row.hidden_at is null then story_message.interaction_key else null end,
          'messagePurpose', case when message_row.hidden_at is null then story_message.message_purpose else null end,
          'body', case
            when message_row.hidden_at is null then message_row.body
            else 'Message removed by an administrator.'
          end,
          'moderated', message_row.hidden_at is not null,
          'self', message_row.sender_type = 'player'
            and message_row.sender_player_id = p_player_id,
          'createdAt', message_row.created_at
        ) as payload
      from public.messages as message_row
      left join public.story_messages as story_message
        on story_message.game_session_id = message_row.game_session_id
        and story_message.message_id = message_row.id
      left join public.storyline_events as story_event
        on story_event.id = story_message.source_storyline_event_id
      left join public.storylines as storyline_row
        on storyline_row.id = story_event.storyline_id
      left join public.players as player_sender
        on player_sender.game_session_id = message_row.game_session_id
        and player_sender.id = message_row.sender_player_id
      left join public.staff_users as staff_sender
        on staff_sender.id = message_row.sender_staff_user_id
      where message_row.game_session_id = p_game_session_id
        and message_row.thread_id = p_thread_id
      order by message_row.created_at desc, message_row.public_message_id desc
      limit p_message_limit
    ) as message_payload
  ) as message_values
  where thread_row.game_session_id = p_game_session_id
    and thread_row.id = p_thread_id;
$function$;

-- Legacy shape reuses the hardened V2 projection so story sender identity cannot
-- diverge between old and current read paths.
create or replace function public.read_player_messages_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_thread_limit integer default 25,
  p_message_limit integer default 50
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
  v_result := public.read_player_messages_v2(
    p_game_session_id,
    p_player_id,
    p_thread_limit,
    p_message_limit,
    null,
    null,
    null
  );

  return jsonb_build_object(
    'unreadCount', coalesce((v_result ->> 'unreadCount')::integer, 0),
    'threads', coalesce(v_result -> 'threads', '[]'::jsonb)
  );
end;
$function$;

create or replace function public.read_admin_message_threads_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_status text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_result jsonb;
begin
  if p_game_session_id is null
    or p_staff_user_id is null
    or (v_status is not null and v_status not in ('active', 'disabled', 'closed'))
    or p_limit is null or p_limit not between 1 and 51
    or p_offset is null or p_offset not between 0 and 10000
  then
    raise exception 'ADMIN_MESSAGES_READ_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
      and game_row.owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'ADMIN_MESSAGES_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  with selected_threads as (
    select
      thread_row.*,
      story_thread.character_key as story_character_key,
      story_thread.character_name as story_character_name
    from public.message_threads as thread_row
    left join public.story_message_threads as story_thread
      on story_thread.game_session_id = thread_row.game_session_id
      and story_thread.thread_id = thread_row.id
    where thread_row.game_session_id = p_game_session_id
      and (v_status is null or thread_row.status = v_status)
    order by thread_row.updated_at desc, thread_row.public_thread_id desc
    limit p_limit
    offset p_offset
  ),
  rendered_threads as (
    select
      selected_thread.updated_at,
      selected_thread.public_thread_id,
      jsonb_build_object(
        'id', selected_thread.public_thread_id,
        'type', selected_thread.thread_type,
        'title', selected_thread.title,
        'contractKey', selected_thread.contract_key,
        'storyCharacterKey', selected_thread.story_character_key,
        'storyCharacterName', selected_thread.story_character_name,
        'allowPlayerReplies', selected_thread.allow_player_replies,
        'status', selected_thread.status,
        'moderationReason', selected_thread.moderation_reason,
        'retentionUntil', selected_thread.retention_until,
        'expired', selected_thread.retention_until <= now(),
        'createdAt', selected_thread.created_at,
        'updatedAt', selected_thread.updated_at,
        'participants', participant_values.participants,
        'messages', message_values.messages
      ) as payload
    from selected_threads as selected_thread
    cross join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'reference', case
              when player_row.player_identifier is not null
                and player_row.player_identifier !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then player_row.player_identifier
              else null
            end,
            'displayName', coalesce(player_row.display_name, 'Player'),
            'rosterLabel', player_row.roster_label,
            'lastReadAt', participant_row.last_read_at
          )
          order by coalesce(player_row.display_name, ''), player_row.player_identifier
        ),
        '[]'::jsonb
      ) as participants
      from public.message_thread_participants as participant_row
      join public.players as player_row
        on player_row.game_session_id = participant_row.game_session_id
        and player_row.id = participant_row.player_id
      where participant_row.game_session_id = p_game_session_id
        and participant_row.thread_id = selected_thread.id
    ) as participant_values
    cross join lateral (
      select coalesce(
        jsonb_agg(
          message_payload.payload
          order by message_payload.created_at asc, message_payload.public_message_id asc
        ),
        '[]'::jsonb
      ) as messages
      from (
        select
          message_row.created_at,
          message_row.public_message_id,
          jsonb_build_object(
            'id', message_row.public_message_id,
            'senderType', message_row.sender_type,
            'senderName', case
              when story_message.message_id is not null then selected_thread.story_character_name
              when message_row.sender_type = 'player' then coalesce(player_sender.display_name, 'Player')
              when message_row.sender_type = 'staff_user' then coalesce(staff_sender.display_name, 'Administrator')
              else 'System'
            end,
            'senderCharacterKey', case
              when story_message.message_id is not null then selected_thread.story_character_key
              else null
            end,
            'storylineKey', storyline_row.key,
            'storyEventKey', story_event.event_key,
            'interactionKey', story_message.interaction_key,
            'messagePurpose', story_message.message_purpose,
            'body', message_row.body,
            'hidden', message_row.hidden_at is not null,
            'hiddenReason', message_row.hidden_reason,
            'createdAt', message_row.created_at
          ) as payload
        from public.messages as message_row
        left join public.story_messages as story_message
          on story_message.game_session_id = message_row.game_session_id
          and story_message.message_id = message_row.id
        left join public.storyline_events as story_event
          on story_event.id = story_message.source_storyline_event_id
        left join public.storylines as storyline_row
          on storyline_row.id = story_event.storyline_id
        left join public.players as player_sender
          on player_sender.game_session_id = message_row.game_session_id
          and player_sender.id = message_row.sender_player_id
        left join public.staff_users as staff_sender
          on staff_sender.id = message_row.sender_staff_user_id
        where message_row.game_session_id = p_game_session_id
          and message_row.thread_id = selected_thread.id
        order by message_row.created_at desc, message_row.public_message_id desc
        limit 100
      ) as message_payload
    ) as message_values
  )
  select jsonb_build_object(
    'threads', coalesce(
      jsonb_agg(
        rendered_threads.payload
        order by rendered_threads.updated_at desc, rendered_threads.public_thread_id desc
      ),
      '[]'::jsonb
    ),
    'returned', count(*)::integer
  )
  into v_result
  from rendered_threads;

  return coalesce(v_result, jsonb_build_object('threads', '[]'::jsonb, 'returned', 0));
end;
$function$;

revoke all on function public.deliver_story_character_message_v1(uuid, uuid, uuid, integer, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.deliver_story_character_message_v1(uuid, uuid, uuid, integer, text, text, text, text, text)
  to service_role;

revoke all on function public.private_player_message_thread_payload_v1(uuid, uuid, uuid, timestamptz, timestamptz, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.read_player_messages_v1(uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.read_player_messages_v1(uuid, uuid, integer, integer)
  to service_role;
revoke all on function public.read_admin_message_threads_v1(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.read_admin_message_threads_v1(uuid, uuid, text, integer, integer)
  to service_role;

comment on table public.story_message_threads is
  'Private story extension for one persistent Player-character conversation. Generic Messaging remains the inbox, read, retention, and moderation authority.';
comment on table public.story_messages is
  'Private per-message story provenance for server-authored character messages. Stable content keys are projected; internal UUIDs remain server-side.';
comment on function public.deliver_story_character_message_v1(uuid, uuid, uuid, integer, text, text, text, text, text) is
  'Idempotently delivers one read-only story character message to one active Player, reusing a persistent Player-character thread and creating the ordinary Messaging notification.';

commit;
