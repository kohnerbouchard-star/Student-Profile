begin;

alter table public.message_threads
  add column story_character_key text null,
  add column story_character_name text null,
  add column story_player_id uuid null,
  add column story_conversation_key text null;

alter table public.message_threads
  add constraint message_threads_story_character_fields_valid check (
    (story_character_key is null and story_character_name is null and story_player_id is null and story_conversation_key is null)
    or (
      created_by_type = 'system'
      and thread_type = 'system'
      and story_character_key is not null
      and length(btrim(story_character_key)) between 1 and 160
      and story_character_name is not null
      and length(btrim(story_character_name)) between 1 and 160
      and story_player_id is not null
      and story_conversation_key is not null
      and length(btrim(story_conversation_key)) between 1 and 160
    )
  ),
  add constraint message_threads_story_player_scope_fk
    foreign key (game_session_id, story_player_id)
    references public.players(game_session_id, id)
    on delete cascade;

create unique index message_threads_story_conversation_unique
  on public.message_threads (game_session_id, story_player_id, story_conversation_key)
  where story_character_key is not null;

alter table public.message_threads
  drop constraint message_threads_reply_policy_valid,
  add constraint message_threads_reply_policy_valid check (
    (thread_type = 'announcement' and allow_player_replies = false)
    or (thread_type = 'system' and (allow_player_replies = false or story_character_key is not null))
    or thread_type in ('player', 'contract')
  );

create unique index messages_system_idempotency_unique
  on public.messages (game_session_id, idempotency_key)
  where sender_type = 'system' and idempotency_key is not null;

create or replace function public.deliver_story_character_message_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_character_key text,
  p_character_name text,
  p_conversation_key text,
  p_title text,
  p_body text,
  p_allow_player_replies boolean,
  p_idempotency_key text
)
returns table (
  delivery_outcome text,
  thread_id text,
  message_id text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_character_key text := btrim(coalesce(p_character_key, ''));
  v_character_name text := btrim(coalesce(p_character_name, ''));
  v_conversation_key text := btrim(coalesce(p_conversation_key, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_thread public.message_threads%rowtype;
  v_message public.messages%rowtype;
  v_notification_id uuid;
begin
  if p_game_session_id is null or p_player_id is null
    or length(v_character_key) not between 1 and 160
    or length(v_character_name) not between 1 and 160
    or length(v_conversation_key) not between 1 and 160
    or length(v_title) not between 1 and 160
    or length(v_body) not between 1 and 1000
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or v_title ~ '[[:cntrl:]]'
    or v_body ~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
  then
    raise exception 'STORY_CHARACTER_MESSAGE_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.game_sessions g
    where g.id = p_game_session_id and g.status = 'active'
  ) or not exists (
    select 1 from public.players p
    where p.game_session_id = p_game_session_id
      and p.id = p_player_id
      and p.status = 'active'
  ) then
    raise exception 'STORY_CHARACTER_MESSAGE_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_thread
  from public.message_threads t
  where t.game_session_id = p_game_session_id
    and t.story_player_id = p_player_id
    and t.story_conversation_key = v_conversation_key
  for update;

  if found then
    if v_thread.story_character_key <> v_character_key then
      raise exception 'STORY_CHARACTER_CONVERSATION_CONFLICT' using errcode = 'P0001';
    end if;
    update public.message_threads
      set title = v_title,
          story_character_name = v_character_name,
          allow_player_replies = coalesce(p_allow_player_replies, true)
      where id = v_thread.id
      returning * into v_thread;
  else
    insert into public.message_threads (
      game_session_id, thread_type, title, allow_player_replies, status,
      retention_until, created_by_type, story_character_key, story_character_name,
      story_player_id, story_conversation_key
    ) values (
      p_game_session_id, 'system', v_title, coalesce(p_allow_player_replies, true), 'active',
      now() + interval '365 days', 'system', v_character_key, v_character_name,
      p_player_id, v_conversation_key
    ) returning * into v_thread;

    insert into public.message_thread_participants (thread_id, game_session_id, player_id)
    values (v_thread.id, p_game_session_id, p_player_id);
  end if;

  select * into v_message
  from public.messages m
  where m.game_session_id = p_game_session_id
    and m.sender_type = 'system'
    and m.idempotency_key = v_key
  for update;

  if found then
    if v_message.thread_id <> v_thread.id or v_message.body <> v_body then
      raise exception 'STORY_CHARACTER_MESSAGE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select 'replayed'::text, v_thread.public_thread_id,
      v_message.public_message_id, v_message.created_at;
    return;
  end if;

  insert into public.messages (
    thread_id, game_session_id, sender_type, body, idempotency_key
  ) values (
    v_thread.id, p_game_session_id, 'system', v_body, v_key
  ) returning * into v_message;

  update public.message_threads set updated_at = v_message.created_at
  where id = v_thread.id;

  insert into public.notifications (
    game_session_id, source_type, source_id, notification_type, title, summary,
    priority, display_mode, payload, published_at
  ) values (
    p_game_session_id, 'message', v_message.public_message_id, 'message_received',
    v_title, 'New message from ' || v_character_name || '.', 'normal', 'inbox',
    jsonb_build_object(
      'threadId', v_thread.public_thread_id,
      'messageId', v_message.public_message_id,
      'characterKey', v_character_key,
      'characterName', v_character_name
    ),
    v_message.created_at
  ) returning id into v_notification_id;

  insert into public.notification_deliveries (
    notification_id, game_session_id, player_id, delivered_at
  ) values (
    v_notification_id, p_game_session_id, p_player_id, v_message.created_at
  ) on conflict (notification_id, player_id) do nothing;

  return query select 'applied'::text, v_thread.public_thread_id,
    v_message.public_message_id, v_message.created_at;
end;
$function$;

create or replace function public.deliver_story_character_message_from_impact_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.effect_type <> 'character_message' then
    return new;
  end if;

  perform public.deliver_story_character_message_v1(
    new.game_session_id,
    new.player_id,
    new.payload ->> 'characterKey',
    new.payload ->> 'characterName',
    new.payload ->> 'conversationKey',
    new.payload ->> 'title',
    new.payload ->> 'body',
    coalesce((new.payload ->> 'allowPlayerReplies')::boolean, true),
    'story_' || replace(new.id::text, '-', '')
  );

  return new;
end;
$function$;

create trigger deliver_story_character_message_from_impact_v1
after insert on public.player_story_impacts
for each row
when (new.effect_type = 'character_message')
execute function public.deliver_story_character_message_from_impact_v1();

revoke all on function public.deliver_story_character_message_v1(uuid, uuid, text, text, text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.deliver_story_character_message_v1(uuid, uuid, text, text, text, text, text, boolean, text)
  to service_role;

comment on function public.deliver_story_character_message_v1(uuid, uuid, text, text, text, text, text, boolean, text) is
  'Creates or reuses one player-scoped story-character conversation and delivers an idempotent system-owned character message through the canonical Messaging inbox.';

commit;
